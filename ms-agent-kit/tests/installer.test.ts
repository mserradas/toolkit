import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildArtifacts } from "../src/adapters/index.js"
import { DEFAULT_ASSETS_ROOT } from "../src/core/catalog.js"
import { applyPlan, installationStatus, uninstallTargets } from "../src/core/installer.js"
import { createPlan } from "../src/core/planner.js"
import type { BuildContext } from "../src/core/types.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function testContext(): Promise<BuildContext> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-install-"))
  temporaryDirectories.push(projectRoot)
  return {
    assetsRoot: DEFAULT_ASSETS_ROOT,
    homeDir: path.join(projectRoot, "home"),
    projectRoot,
    scope: "project",
  }
}

describe("transactional installer", () => {
  it("installs all targets idempotently", async () => {
    const context = await testContext()
    const artifacts = await buildArtifacts(["opencode", "claude", "codex"], context)
    const firstPlan = await createPlan(artifacts, context)

    expect(firstPlan.items.every((item) => item.action === "create")).toBe(true)
    const result = await applyPlan(firstPlan, context)
    expect(result.created).toBe(94)

    const secondPlan = await createPlan(artifacts, context)
    expect(secondPlan.items.every((item) => item.action === "unchanged")).toBe(true)
    const status = await installationStatus(["opencode", "claude", "codex"], context)
    expect(status).toHaveLength(94)
    expect(status.every((item) => item.status === "ok")).toBe(true)
  })

  it("keeps OpenCode and Codex skill installations isolated", async () => {
    const context = await testContext()
    const artifacts = await buildArtifacts(["opencode", "codex"], context)
    await applyPlan(await createPlan(artifacts, context), context)
    const openCodeSkill = artifacts.find(
      (artifact) =>
        artifact.target === "opencode" &&
        artifact.kind === "skill" &&
        artifact.name === "cognitive-doc-design",
    )!
    const codexSkill = artifacts.find(
      (artifact) =>
        artifact.target === "codex" &&
        artifact.kind === "skill" &&
        artifact.name === "cognitive-doc-design",
    )!

    expect(openCodeSkill.destination).not.toBe(codexSkill.destination)

    await uninstallTargets(["opencode"], context)
    await expect(access(openCodeSkill.destination)).rejects.toMatchObject({ code: "ENOENT" })
    await expect(access(openCodeSkill.root)).resolves.toBeUndefined()
    await expect(access(codexSkill.destination)).resolves.toBeUndefined()
  })

  it("migrates a shared skill to an isolated OpenCode copy without deleting Codex", async () => {
    const context = await testContext()
    const codexArtifacts = await buildArtifacts(["codex"], context)
    const sharedSkill = codexArtifacts.find(
      (artifact) => artifact.kind === "skill" && artifact.name === "cognitive-doc-design",
    )!
    await applyPlan(
      await createPlan([{ ...sharedSkill, targets: ["codex", "opencode"] }], context),
      context,
    )

    const openCodeArtifacts = await buildArtifacts(["opencode"], context)
    const privateSkill = openCodeArtifacts.find(
      (artifact) => artifact.kind === "skill" && artifact.name === "cognitive-doc-design",
    )!
    const migration = await createPlan(openCodeArtifacts, context)
    expect(migration.obsolete).toContainEqual(
      expect.objectContaining({
        action: "detach",
        file: expect.objectContaining({ path: sharedSkill.destination }),
        obsoleteTargets: ["opencode"],
        remainingTargets: ["codex"],
      }),
    )

    await applyPlan(migration, context)
    await expect(access(sharedSkill.destination)).resolves.toBeUndefined()
    await expect(access(privateSkill.destination)).resolves.toBeUndefined()
    expect(await installationStatus(["opencode", "codex"], context)).toEqual(
      expect.arrayContaining([
        { target: "codex", path: sharedSkill.destination, status: "ok" },
        { target: "opencode", path: privateSkill.destination, status: "ok" },
      ]),
    )
  })

  it("removes obsolete managed skill copies during an update", async () => {
    const context = await testContext()
    const legacyPath = path.join(context.projectRoot, ".opencode", "skills", "legacy", "SKILL.md")
    const legacyArtifacts = [
      {
        target: "opencode" as const,
        kind: "skill" as const,
        name: "legacy",
        root: path.join(context.projectRoot, ".opencode"),
        destination: legacyPath,
        content: Buffer.from("---\nname: legacy\ndescription: legacy\n---\n"),
        mode: 0o644,
      },
    ]
    await applyPlan(await createPlan(legacyArtifacts, context), context)

    const currentArtifacts = await buildArtifacts(["opencode"], context)
    const migrationPlan = await createPlan(currentArtifacts, context)
    expect(migrationPlan.obsolete).toContainEqual(
      expect.objectContaining({ action: "remove", file: expect.objectContaining({ path: legacyPath }) }),
    )
    const result = await applyPlan(migrationPlan, context)

    expect(result.removed).toBe(1)
    await expect(access(legacyPath)).rejects.toMatchObject({ code: "ENOENT" })
    await expect(access(path.dirname(legacyPath))).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("removes the obsolete public Codex ms-shared skill during an update", async () => {
    const context = await testContext()
    const legacyPath = path.join(context.projectRoot, ".agents", "skills", "ms-shared", "SKILL.md")
    const legacyArtifacts = [
      {
        target: "codex" as const,
        kind: "skill" as const,
        name: "ms-shared",
        root: path.join(context.projectRoot, ".agents", "skills"),
        destination: legacyPath,
        content: Buffer.from("---\nname: ms-shared\ndescription: legacy\n---\n"),
        mode: 0o644,
      },
    ]
    await applyPlan(await createPlan(legacyArtifacts, context), context)

    const currentArtifacts = await buildArtifacts(["codex"], context)
    expect(currentArtifacts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "skill", name: "ms-shared" })]),
    )
    const migrationPlan = await createPlan(currentArtifacts, context)
    expect(migrationPlan.obsolete).toContainEqual(
      expect.objectContaining({
        action: "remove",
        file: expect.objectContaining({ path: legacyPath }),
      }),
    )

    const result = await applyPlan(migrationPlan, context)
    expect(result.removed).toBe(1)
    await expect(access(legacyPath)).rejects.toMatchObject({ code: "ENOENT" })
    await expect(access(path.dirname(legacyPath))).rejects.toMatchObject({ code: "ENOENT" })
    await expect(access(legacyArtifacts[0]!.root)).resolves.toBeUndefined()
  })

  it("keeps user content next to an obsolete managed skill", async () => {
    const context = await testContext()
    const skillDirectory = path.join(context.projectRoot, ".agents", "skills", "legacy")
    const legacyPath = path.join(skillDirectory, "SKILL.md")
    const userPath = path.join(skillDirectory, "notes.txt")
    const legacyArtifacts = [
      {
        target: "codex" as const,
        kind: "skill" as const,
        name: "legacy",
        root: path.join(context.projectRoot, ".agents", "skills"),
        destination: legacyPath,
        content: Buffer.from("---\nname: legacy\ndescription: legacy\n---\n"),
        mode: 0o644,
      },
    ]
    await applyPlan(await createPlan(legacyArtifacts, context), context)
    await writeFile(userPath, "contenido del usuario\n", "utf8")

    const currentArtifacts = await buildArtifacts(["codex"], context)
    const result = await applyPlan(await createPlan(currentArtifacts, context), context)

    expect(result.removed).toBe(1)
    await expect(access(legacyPath)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await readFile(userPath, "utf8")).toBe("contenido del usuario\n")
    await expect(access(skillDirectory)).resolves.toBeUndefined()
  })

  it("backs up an external conflict and restores it on uninstall", async () => {
    const context = await testContext()
    const artifacts = await buildArtifacts(["codex"], context)
    const scout = artifacts.find((artifact) => artifact.name === "ms-scout" && artifact.kind === "agent")!
    await mkdir(path.dirname(scout.destination), { recursive: true })
    await writeFile(scout.destination, "configuracion del usuario\n", "utf8")

    const blockedPlan = await createPlan(artifacts, context)
    expect(blockedPlan.items.find((item) => item.artifact.destination === scout.destination)?.action).toBe(
      "conflict",
    )

    const forcedPlan = await createPlan(artifacts, context, true)
    await applyPlan(forcedPlan, context)
    expect(await readFile(scout.destination, "utf8")).toContain("developer_instructions")

    const uninstall = await uninstallTargets(["codex"], context)
    expect(uninstall.restored).toContain(scout.destination)
    expect(await readFile(scout.destination, "utf8")).toBe("configuracion del usuario\n")
  })

  it("preserves a user edit adopted by a forced update", async () => {
    const context = await testContext()
    const artifacts = await buildArtifacts(["codex"], context)
    await applyPlan(await createPlan(artifacts, context), context)
    const scout = artifacts.find((artifact) => artifact.name === "ms-scout" && artifact.kind === "agent")!
    await writeFile(scout.destination, "edicion posterior\n", "utf8")

    const blocked = await createPlan(artifacts, context)
    expect(blocked.items.find((item) => item.artifact.destination === scout.destination)?.action).toBe(
      "conflict",
    )
    await applyPlan(await createPlan(artifacts, context, true), context)
    await uninstallTargets(["codex"], context)

    expect(await readFile(scout.destination, "utf8")).toBe("edicion posterior\n")
  })

  it("reconciles managed state when the current file already matches the desired content", async () => {
    const context = await testContext()
    const destination = path.join(context.projectRoot, ".codex", "managed.txt")
    const initial = {
      target: "codex" as const,
      kind: "configuration" as const,
      name: "managed.txt",
      root: path.join(context.projectRoot, ".codex"),
      destination,
      content: Buffer.from("initial\n"),
      mode: 0o644,
    }
    await applyPlan(await createPlan([initial], context), context)

    const desired = { ...initial, content: Buffer.from("desired\n") }
    await writeFile(destination, desired.content)
    const plan = await createPlan([desired], context)
    expect(plan.items).toContainEqual(expect.objectContaining({ action: "unchanged" }))

    await applyPlan(plan, context)
    expect(await installationStatus(["codex"], context)).toEqual([
      { target: "codex", path: destination, status: "ok" },
    ])
  })

  it("does not uninstall files modified after installation", async () => {
    const context = await testContext()
    const artifacts = await buildArtifacts(["claude"], context)
    await applyPlan(await createPlan(artifacts, context), context)
    const tester = artifacts.find((artifact) => artifact.name === "ms-tester" && artifact.kind === "agent")!
    await writeFile(tester.destination, "cambio local\n", "utf8")

    const result = await uninstallTargets(["claude"], context)
    expect(result.skipped).toContainEqual({
      path: tester.destination,
      reason: "modificado despues de instalar",
    })
    expect(await readFile(tester.destination, "utf8")).toBe("cambio local\n")
  })

  it("rejects a destination that escapes through a symlink", async () => {
    const context = await testContext()
    const outside = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-outside-"))
    temporaryDirectories.push(outside)
    const codexRoot = path.join(context.projectRoot, ".codex")
    await mkdir(codexRoot, { recursive: true })
    await symlink(outside, path.join(codexRoot, "agents"))

    const artifacts = await buildArtifacts(["codex"], context)
    const plan = await createPlan(artifacts, context)
    expect(plan.items).toContainEqual(
      expect.objectContaining({ action: "conflict", reason: expect.stringMatching(/symlink|escapa/) }),
    )
    await expect(applyPlan(plan, context)).rejects.toThrow(/conflicto/)
    await expect(access(path.join(outside, "ms-codex.toml"))).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("reports a dangling skill directory symlink as a planning conflict", async () => {
    const context = await testContext()
    const skillsRoot = path.join(context.projectRoot, ".claude", "skills")
    await mkdir(skillsRoot, { recursive: true })
    await symlink(
      path.join(context.projectRoot, ".agents", "skills", "skill-creator"),
      path.join(skillsRoot, "skill-creator"),
    )

    const artifacts = await buildArtifacts(["claude"], context)
    const plan = await createPlan(artifacts, context)
    expect(
      plan.items.find(
        (item) => item.artifact.kind === "skill" && item.artifact.name === "skill-creator",
      ),
    ).toEqual(
      expect.objectContaining({
        action: "conflict",
        reason: expect.stringMatching(/symlink roto/),
      }),
    )
    await expect(applyPlan(plan, context)).rejects.toThrow(/conflicto/)
    await expect(
      access(path.join(context.projectRoot, ".claude", "agents", "ms-architect.md")),
    ).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("protects and restores an existing OpenCode configuration", async () => {
    const context = await testContext()
    const artifacts = await buildArtifacts(["opencode"], context)
    const config = artifacts.find(
      (artifact) => artifact.kind === "configuration" && artifact.name === "opencode.json",
    )!
    const original = '{"model":"provider/custom-model"}\n'
    await writeFile(config.destination, original, "utf8")

    const blocked = await createPlan(artifacts, context)
    expect(blocked.items.find((item) => item.artifact.destination === config.destination)?.action).toBe(
      "conflict",
    )
    await expect(applyPlan(blocked, context)).rejects.toThrow(/conflicto/)
    expect(await readFile(config.destination, "utf8")).toBe(original)

    await applyPlan(await createPlan(artifacts, context, true), context)
    expect(await readFile(config.destination, "utf8")).toContain("CONTEXT7_API_KEY")
    const uninstall = await uninstallTargets(["opencode"], context)
    expect(uninstall.restored).toContain(config.destination)
    expect(await readFile(config.destination, "utf8")).toBe(original)
  })
})
