import { access, chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildArtifacts } from "../src/adapters/index.js"
import { DEFAULT_ASSETS_ROOT } from "../src/core/catalog.js"
import { applyPlan, installationStatus, uninstallTargets } from "../src/core/installer.js"
import { createPlan } from "../src/core/planner.js"
import type { Artifact, BuildContext, InstallState } from "../src/core/types.js"

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

function managedArtifact(
  context: BuildContext,
  overrides: Partial<Artifact> = {},
): Artifact {
  const root = path.join(context.projectRoot, ".codex")
  return {
    target: "codex",
    kind: "configuration",
    name: "context7",
    root,
    destination: path.join(root, "config.toml"),
    content: Buffer.from(
      '[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"\n' +
        'env_http_headers = { "CONTEXT7_API_KEY" = "CONTEXT7_API_KEY" }\n',
    ),
    mode: 0o644,
    strategy: "managed-block",
    blockId: "codex-context7",
    satisfaction: "codex-context7",
    ...overrides,
  }
}

async function installedState(context: BuildContext): Promise<InstallState> {
  return JSON.parse(
    await readFile(path.join(context.projectRoot, ".ms-agent-kit", "state.json"), "utf8"),
  ) as InstallState
}

function legacyCodexMetadataArtifact(
  context: BuildContext,
  overrides: Partial<Artifact> = {},
): Artifact {
  const root = path.join(context.projectRoot, ".agents", "skills")
  return {
    target: "codex",
    kind: "skill",
    name: "ms-architect",
    root,
    destination: path.join(root, "ms-architect", "agents", "openai.yaml"),
    content: Buffer.from(
      "dependencies:\n" +
        "  tools:\n" +
        "    - type: mcp\n" +
        "      value: context7\n" +
        "      transport: streamable_http\n" +
        "      url: https://mcp.context7.com/mcp\n",
    ),
    mode: 0o644,
    ...overrides,
  }
}

describe("transactional installer", () => {
  it("installs all targets idempotently", async () => {
    const context = await testContext()
    const artifacts = await buildArtifacts(["opencode", "claude", "codex"], context)
    const firstPlan = await createPlan(artifacts, context)

    expect(firstPlan.items.every((item) => item.action === "create")).toBe(true)
    const result = await applyPlan(firstPlan, context)
    expect(result.created).toBe(artifacts.length)

    const secondPlan = await createPlan(artifacts, context)
    expect(secondPlan.items.every((item) => item.action === "unchanged")).toBe(true)
    const status = await installationStatus(["opencode", "claude", "codex"], context)
    expect(status).toHaveLength(artifacts.length)
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
      reason: "modificado después de instalar",
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
        reason: expect.stringMatching(/symlink.*roto/),
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

describe("managed-block installer", () => {
  it("preserves exterior bytes and mode across install, update, status and uninstall", async () => {
    const context = await testContext()
    const artifact = managedArtifact(context)
    const exterior = Buffer.from([0x70, 0x72, 0x65, 0x66, 0x69, 0x78])
    await mkdir(path.dirname(artifact.destination), { recursive: true })
    await writeFile(artifact.destination, exterior)
    await chmod(artifact.destination, 0o640)

    const plan = await createPlan([artifact], context)
    expect(plan.items[0]).toEqual(
      expect.objectContaining({ action: "update", strategy: "managed-block", leadingSeparator: "\n" }),
    )
    await applyPlan(plan, context)
    let installed = await readFile(artifact.destination)
    expect(installed.subarray(0, exterior.length)).toEqual(exterior)
    expect((await stat(artifact.destination)).mode & 0o777).toBe(0o640)

    const outsideEdit = Buffer.concat([Buffer.from("outside:"), installed])
    await writeFile(artifact.destination, outsideEdit)
    expect(await installationStatus(["codex"], context)).toEqual([
      { target: "codex", path: artifact.destination, status: "ok" },
    ])

    const updatedArtifact = {
      ...artifact,
      content: Buffer.from(
        '[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"\n' +
          'env_http_headers = { "CONTEXT7_API_KEY" = "CONTEXT7_API_KEY" }\n' +
          "startup_timeout_sec = 20\n",
      ),
    }
    const updatePlan = await createPlan([updatedArtifact], context)
    expect(updatePlan.items[0]?.action).toBe("update")
    await applyPlan(updatePlan, context)
    installed = await readFile(artifact.destination)
    expect(installed.subarray(0, outsideEdit.indexOf(exterior) + exterior.length)).toEqual(
      outsideEdit.subarray(0, outsideEdit.indexOf(exterior) + exterior.length),
    )

    const uninstall = await uninstallTargets(["codex"], context)
    expect(uninstall.removed).toContain(artifact.destination)
    expect(await readFile(artifact.destination)).toEqual(Buffer.concat([Buffer.from("outside:"), exterior]))
    expect((await stat(artifact.destination)).mode & 0o777).toBe(0o640)
  })

  it("removes a file created only for the block but retains a preexisting empty file", async () => {
    const createdContext = await testContext()
    const createdArtifact = managedArtifact(createdContext)
    await applyPlan(await createPlan([createdArtifact], createdContext), createdContext)
    await uninstallTargets(["codex"], createdContext)
    await expect(access(createdArtifact.destination)).rejects.toMatchObject({ code: "ENOENT" })

    const emptyContext = await testContext()
    const emptyArtifact = managedArtifact(emptyContext)
    await mkdir(path.dirname(emptyArtifact.destination), { recursive: true })
    await writeFile(emptyArtifact.destination, Buffer.alloc(0))
    await chmod(emptyArtifact.destination, 0o600)
    await applyPlan(await createPlan([emptyArtifact], emptyContext), emptyContext)
    await uninstallTargets(["codex"], emptyContext)
    expect(await readFile(emptyArtifact.destination)).toEqual(Buffer.alloc(0))
    expect((await stat(emptyArtifact.destination)).mode & 0o777).toBe(0o600)
  })

  it("adopts an exact existing block without rewriting it", async () => {
    const context = await testContext()
    const artifact = managedArtifact(context)
    const first = await createPlan([artifact], context)
    await applyPlan(first, context)
    const exact = await readFile(artifact.destination)
    await rm(path.join(context.projectRoot, ".ms-agent-kit"), { recursive: true })
    await chmod(artifact.destination, 0o600)

    const adoption = await createPlan([artifact], context)
    expect(adoption.items[0]).toEqual(
      expect.objectContaining({ action: "unchanged", currentBlockHash: expect.any(String) }),
    )
    const result = await applyPlan(adoption, context)
    expect(result.unchanged).toBe(1)
    expect(await readFile(artifact.destination)).toEqual(exact)
    expect((await stat(artifact.destination)).mode & 0o777).toBe(0o600)
    expect((await installedState(context)).files[0]).toEqual(
      expect.objectContaining({ strategy: "managed-block", createdFile: false }),
    )
  })

  it("accepts an equivalent external table without writing or ownership", async () => {
    const context = await testContext()
    const artifact = managedArtifact(context)
    const external =
      "# user owned\n[mcp_servers.context7]\n" +
      "env_http_headers = { 'CONTEXT7_API_KEY' = 'CONTEXT7_API_KEY' }\n" +
      "url = 'https://mcp.context7.com/mcp'\n"
    await mkdir(path.dirname(artifact.destination), { recursive: true })
    await writeFile(artifact.destination, external)

    const plan = await createPlan([artifact], context)
    expect(plan.items[0]).toEqual(
      expect.objectContaining({ action: "unchanged", satisfiedExternally: true }),
    )
    await applyPlan(plan, context)
    expect(await readFile(artifact.destination, "utf8")).toBe(external)
    expect((await installedState(context)).files).toEqual([])
    expect(await installationStatus(["codex"], context)).toEqual([])
  })

  it("protects a conflicting external table even with force", async () => {
    const context = await testContext()
    const artifact = managedArtifact(context)
    const external =
      '[mcp_servers.context7]\nurl = "https://other.example/mcp"\n' +
      'env_http_headers = { "CONTEXT7_API_KEY" = "real-secret" }\n'
    await mkdir(path.dirname(artifact.destination), { recursive: true })
    await writeFile(artifact.destination, external)

    expect((await createPlan([artifact], context)).items[0]?.action).toBe("conflict")
    const forced = await createPlan([artifact], context, true)
    expect(forced.items[0]?.action).toBe("conflict")
    await expect(applyPlan(forced, context)).rejects.toThrow(/conflicto/)
    expect(await readFile(artifact.destination, "utf8")).toBe(external)
  })

  it("uses force to restore only a modified block", async () => {
    const context = await testContext()
    const artifact = managedArtifact(context)
    await mkdir(path.dirname(artifact.destination), { recursive: true })
    await writeFile(artifact.destination, "before\n")
    await applyPlan(await createPlan([artifact], context), context)
    const installed = await readFile(artifact.destination, "utf8")
    await writeFile(
      artifact.destination,
      `outside\n${installed.replace("https://mcp.context7.com/mcp", "https://changed.example")}`,
    )

    expect(await installationStatus(["codex"], context)).toEqual([
      { target: "codex", path: artifact.destination, status: "modified" },
    ])
    expect((await createPlan([artifact], context)).items[0]?.action).toBe("conflict")
    const forced = await createPlan([artifact], context, true)
    expect(forced.items[0]?.action).toBe("update")
    await applyPlan(forced, context)
    const restored = await readFile(artifact.destination, "utf8")
    expect(restored.startsWith("outside\nbefore\n")).toBe(true)
    expect(restored).toContain("https://mcp.context7.com/mcp")
    expect(restored).not.toContain("changed.example")
  })

  it("never removes a modified block or its exterior during uninstall", async () => {
    const context = await testContext()
    const artifact = managedArtifact(context)
    await mkdir(path.dirname(artifact.destination), { recursive: true })
    await writeFile(artifact.destination, "user-prefix\n")
    await applyPlan(await createPlan([artifact], context), context)
    const changed = `new-exterior\n${(await readFile(artifact.destination, "utf8")).replace(
      "mcp.context7.com",
      "changed.example",
    )}`
    await writeFile(artifact.destination, changed)

    const uninstall = await uninstallTargets(["codex"], context)
    expect(uninstall.skipped).toContainEqual({
      path: artifact.destination,
      reason: "modificado después de instalar",
    })
    expect(await readFile(artifact.destination, "utf8")).toBe(changed)
    expect((await installedState(context)).files).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: artifact.destination })]),
    )
  })

  it.each(["outside", "inside"])("rejects an %s change between plan and apply", async (where) => {
    const context = await testContext()
    const artifact = managedArtifact(context)
    await applyPlan(await createPlan([artifact], context), context)
    const plan = await createPlan([
      { ...artifact, content: Buffer.concat([artifact.content, Buffer.from("enabled = true\n")]) },
    ], context)
    const current = await readFile(artifact.destination, "utf8")
    await writeFile(
      artifact.destination,
      where === "outside"
        ? `# external edit\n${current}`
        : current.replace("https://mcp.context7.com/mcp", "https://race.example"),
    )
    await expect(applyPlan(plan, context)).rejects.toThrow(/cambió después del plan/)
  })

  it("rolls back an earlier block mutation to the immediate bytes and mode", async () => {
    const context = await testContext()
    const artifact = managedArtifact(context)
    await mkdir(path.dirname(artifact.destination), { recursive: true })
    await writeFile(artifact.destination, "user-prefix")
    await chmod(artifact.destination, 0o640)
    await applyPlan(await createPlan([artifact], context), context)
    await writeFile(artifact.destination, Buffer.concat([Buffer.from("latest-"), await readFile(artifact.destination)]))
    const before = await readFile(artifact.destination)

    const updated = { ...artifact, content: Buffer.concat([artifact.content, Buffer.from("enabled = true\n")]) }
    const second: Artifact = {
      ...artifact,
      strategy: undefined,
      blockId: undefined,
      satisfaction: undefined,
      name: "later",
      destination: path.join(artifact.root, "later.toml"),
      content: Buffer.from("managed = true\n"),
    }
    const plan = await createPlan([updated, second], context)
    await mkdir(path.dirname(second.destination), { recursive: true })
    await writeFile(second.destination, "appeared after plan\n")

    await expect(applyPlan(plan, context)).rejects.toThrow(/cambió después del plan/)
    expect(await readFile(artifact.destination)).toEqual(before)
    expect((await stat(artifact.destination)).mode & 0o777).toBe(0o640)
  })

  it("rolls back an earlier managed removal when uninstall later fails", async () => {
    const context = await testContext()
    const first = managedArtifact(context, {
      name: "first",
      destination: path.join(context.projectRoot, ".codex", "a.toml"),
    })
    const second = managedArtifact(context, {
      name: "second",
      destination: path.join(context.projectRoot, ".codex", "z.toml"),
    })
    await applyPlan(await createPlan([first, second], context), context)
    const firstSnapshot = await readFile(first.destination)
    await chmod(first.destination, 0o640)
    const outside = path.join(context.projectRoot, "outside.toml")
    await writeFile(outside, "outside\n")
    await rm(second.destination)
    await symlink(outside, second.destination)

    await expect(uninstallTargets(["codex"], context)).rejects.toThrow(/symlink/)
    expect(await readFile(first.destination)).toEqual(firstSnapshot)
    expect((await stat(first.destination)).mode & 0o777).toBe(0o640)
    expect((await installedState(context)).files).toHaveLength(2)
  })

  it("removes an intact obsolete block while preserving exterior bytes", async () => {
    const context = await testContext()
    const artifact = managedArtifact(context)
    await mkdir(path.dirname(artifact.destination), { recursive: true })
    await writeFile(artifact.destination, "user content")
    await applyPlan(await createPlan([artifact], context), context)
    await writeFile(artifact.destination, Buffer.concat([Buffer.from("new-"), await readFile(artifact.destination)]))
    const replacement = managedArtifact(context, {
      strategy: undefined,
      blockId: undefined,
      satisfaction: undefined,
      name: "replacement",
      destination: path.join(artifact.root, "replacement.toml"),
      content: Buffer.from("replacement = true\n"),
    })

    const plan = await createPlan([replacement], context)
    expect(plan.obsolete).toContainEqual(
      expect.objectContaining({ action: "remove", file: expect.objectContaining({ path: artifact.destination }) }),
    )
    await applyPlan(plan, context)
    expect(await readFile(artifact.destination, "utf8")).toBe("new-user content")
  })

  it("skips modified obsolete blocks and cleans ownership for absent blocks", async () => {
    const modifiedContext = await testContext()
    const modified = managedArtifact(modifiedContext)
    await applyPlan(await createPlan([modified], modifiedContext), modifiedContext)
    await writeFile(
      modified.destination,
      (await readFile(modified.destination, "utf8")).replace("mcp.context7.com", "changed.example"),
    )
    const modifiedReplacement = managedArtifact(modifiedContext, {
      strategy: undefined,
      blockId: undefined,
      satisfaction: undefined,
      name: "replacement",
      destination: path.join(modified.root, "replacement.toml"),
    })
    const modifiedPlan = await createPlan([modifiedReplacement], modifiedContext)
    expect(modifiedPlan.obsolete[0]?.action).toBe("skip")
    await applyPlan(modifiedPlan, modifiedContext)
    expect((await installedState(modifiedContext)).files).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: modified.destination })]),
    )

    const absentContext = await testContext()
    const absent = managedArtifact(absentContext)
    await applyPlan(await createPlan([absent], absentContext), absentContext)
    await rm(absent.destination)
    const absentReplacement = managedArtifact(absentContext, {
      strategy: undefined,
      blockId: undefined,
      satisfaction: undefined,
      name: "replacement",
      destination: path.join(absent.root, "replacement.toml"),
    })
    const absentPlan = await createPlan([absentReplacement], absentContext)
    expect(absentPlan.obsolete[0]?.action).toBe("remove")
    await applyPlan(absentPlan, absentContext)
    expect((await installedState(absentContext)).files).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: absent.destination })]),
    )
  })

  it("rejects a managed-block destination reached through a symlink", async () => {
    const context = await testContext()
    const outside = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-block-outside-"))
    temporaryDirectories.push(outside)
    const artifact = managedArtifact(context)
    await mkdir(artifact.root, { recursive: true })
    await symlink(outside, path.join(artifact.root, "linked"))
    const nestedArtifact = managedArtifact(context, {
      destination: path.join(artifact.root, "linked", "config.toml"),
    })

    const plan = await createPlan([nestedArtifact], context)
    expect(plan.items[0]).toEqual(
      expect.objectContaining({ action: "conflict", reason: expect.stringMatching(/symlink|escapa/) }),
    )
  })

  it.each([
    'mcp_servers.context7.url = "https://mcp.context7.com/mcp"\n',
    'mcp_servers.context7 = { url = "https://mcp.context7.com/mcp" }\n',
    '[mcp_servers]\ncontext7 = { url = "https://mcp.context7.com/mcp" }\n',
    '"mcp_servers".context7.url = "https://mcp.context7.com/mcp"\n',
    'mcp_servers."context7" = { url = "https://mcp.context7.com/mcp" }\n',
    '[mcp_servers]\n"context7" = { url = "https://mcp.context7.com/mcp" }\n',
    'mcp_servers = { context7 = { url = "https://mcp.context7.com/mcp" } }\n',
    '"mcp_ser\\u0076ers".context7.url = "https://mcp.context7.com/mcp"\n',
    '["mcp_ser\\u0076ers".context7]\nurl = "https://mcp.context7.com/mcp"\n',
    '["mcp_servers"]\n"context7" = { url = "https://mcp.context7.com/mcp" }\n',
    "['mcp_servers']\n'context7' = { url = 'https://mcp.context7.com/mcp' }\n",
    '"mcp_ser\\u0076ers" = { "con\\u0074ext7" = { url = "https://mcp.context7.com/mcp" } }\n',
    '[["mcp_ser\\u0076ers".context7]]\nurl = "https://mcp.context7.com/mcp"\n',
    '[["mcp_servers".context7]]\nurl = "https://mcp.context7.com/mcp"\n',
  ])("protects external dotted or inline Context7 definitions even with force %#", async (content) => {
    const context = await testContext()
    const artifact = managedArtifact(context)
    await mkdir(path.dirname(artifact.destination), { recursive: true })
    await writeFile(artifact.destination, content)

    const plan = await createPlan([artifact], context, true)
    expect(plan.items[0]).toEqual(
      expect.objectContaining({ action: "conflict", reason: expect.stringMatching(/protegida/) }),
    )
    await expect(applyPlan(plan, context)).rejects.toThrow(/conflicto/)
    expect(await readFile(artifact.destination, "utf8")).toBe(content)
  })

  it.each(["'''", '\"\"\"'])(
    "never owns marker-looking lines inside %s multiline TOML strings",
    async (delimiter) => {
      const externalContext = await testContext()
      const externalArtifact = managedArtifact(externalContext)
      const markersInString =
        `example = ${delimiter}\n` +
        "# >>> ms-agent-kit managed-block:codex-context7 >>>\n" +
        "not an owned block\n" +
        "# <<< ms-agent-kit managed-block:codex-context7 <<<\n" +
        `${delimiter}\n`
      await mkdir(path.dirname(externalArtifact.destination), { recursive: true })
      await writeFile(externalArtifact.destination, markersInString)

      const blocked = await createPlan([externalArtifact], externalContext, true)
      expect(blocked.items[0]).toEqual(
        expect.objectContaining({ action: "conflict", reason: expect.stringMatching(/ambiguos/) }),
      )
      await expect(applyPlan(blocked, externalContext)).rejects.toThrow(/conflicto/)
      expect(await readFile(externalArtifact.destination, "utf8")).toBe(markersInString)

      const ownedContext = await testContext()
      const ownedArtifact = managedArtifact(ownedContext)
      await applyPlan(await createPlan([ownedArtifact], ownedContext), ownedContext)
      const wrapped =
        `example = ${delimiter}\n` +
        (await readFile(ownedArtifact.destination, "utf8")) +
        `${delimiter}\n`
      await writeFile(ownedArtifact.destination, wrapped)

      expect(await installationStatus(["codex"], ownedContext)).toEqual([
        { target: "codex", path: ownedArtifact.destination, status: "modified" },
      ])
      const uninstall = await uninstallTargets(["codex"], ownedContext)
      expect(uninstall.skipped).toContainEqual({
        path: ownedArtifact.destination,
        reason: "marcadores ambiguos después de instalar",
      })
      expect(await readFile(ownedArtifact.destination, "utf8")).toBe(wrapped)
    },
  )

  it("rejects unknown state strategies without touching the destination", async () => {
    const context = await testContext()
    const artifact = managedArtifact(context)
    const original = "user configuration\n"
    await mkdir(path.dirname(artifact.destination), { recursive: true })
    await writeFile(artifact.destination, original)
    const planCreatedBeforeInvalidState = await createPlan([artifact], context)
    const stateDirectory = path.join(context.projectRoot, ".ms-agent-kit")
    await mkdir(stateDirectory, { recursive: true })
    await writeFile(
      path.join(stateDirectory, "state.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        scope: "project",
        root: context.projectRoot,
        updatedAt: new Date(0).toISOString(),
        files: [
          {
            target: "codex",
            kind: "configuration",
            name: "future",
            path: artifact.destination,
            root: artifact.root,
            afterHash: "not-used",
            original: { existed: false },
            installedAt: new Date(0).toISOString(),
            strategy: "future-strategy",
            blockId: "codex-context7",
            blockHash: "not-used",
            leadingSeparator: "",
            createdFile: false,
          },
        ],
      }, null, 2)}\n`,
    )

    await expect(createPlan([artifact], context)).rejects.toThrow(/estrategia|bloque administrado/i)
    await expect(installationStatus(["codex"], context)).rejects.toThrow(
      /estrategia|bloque administrado/i,
    )
    await expect(uninstallTargets(["codex"], context)).rejects.toThrow(
      /estrategia|bloque administrado/i,
    )
    await expect(applyPlan(planCreatedBeforeInvalidState, context)).rejects.toThrow(
      /estrategia|bloque administrado/i,
    )
    expect(await readFile(artifact.destination, "utf8")).toBe(original)
  })

  it("preserves a concurrent exterior edit when rollback CAS detects divergence", async () => {
    const context = await testContext()
    const artifact = managedArtifact(context)
    const sentinel: Artifact = {
      ...artifact,
      strategy: undefined,
      blockId: undefined,
      satisfaction: undefined,
      name: "obsolete-sentinel",
      destination: path.join(artifact.root, "zz-obsolete.txt"),
      content: Buffer.from("sentinel\n"),
    }
    await applyPlan(await createPlan([sentinel], context), context)
    const original = Buffer.from('model = "user-model"\n')
    await writeFile(artifact.destination, original)

    const large: Artifact = {
      ...sentinel,
      name: "large-delay",
      destination: path.join(artifact.root, "large-delay.bin"),
      content: Buffer.alloc(8 * 1024 * 1024, 0x61),
    }
    const plan = await createPlan([artifact, large], context)
    await writeFile(sentinel.destination, "changed after plan\n")

    let editedContent: Buffer | undefined
    const editFinished = (async () => {
      for (let attempt = 0; attempt < 2_000; attempt += 1) {
        const current = await readFile(artifact.destination)
        if (!current.equals(original)) {
          editedContent = Buffer.concat([Buffer.from("# concurrent exterior\n"), current])
          await writeFile(artifact.destination, editedContent)
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 1))
      }
      throw new Error("La escritura administrada no fue observable durante la prueba")
    })()
    const outcome = applyPlan(plan, context).then(
      () => undefined,
      (error: unknown) => error,
    )
    await editFinished
    const error = await outcome
    expect(error).toBeInstanceOf(AggregateError)
    expect((error as Error).message).toMatch(/instalación y la reversión/)
    const rollbackFailure = (error as AggregateError).errors.find(
      (nested) => nested instanceof AggregateError,
    ) as AggregateError | undefined
    expect(rollbackFailure).toBeInstanceOf(AggregateError)
    expect(
      rollbackFailure?.errors.some((nested) =>
        String(nested).includes("No se revierte un destino editado"),
      ),
    ).toBe(true)
    expect(await readFile(artifact.destination)).toEqual(editedContent)
    expect(await readFile(sentinel.destination, "utf8")).toBe("changed after plan\n")
  })

  it("preserves a concurrent chmod when rollback CAS detects mode divergence", async () => {
    const context = await testContext()
    const artifact = managedArtifact(context)
    const sentinel: Artifact = {
      ...artifact,
      strategy: undefined,
      blockId: undefined,
      satisfaction: undefined,
      name: "obsolete-mode-sentinel",
      destination: path.join(artifact.root, "zz-obsolete-mode.txt"),
      content: Buffer.from("sentinel\n"),
    }
    await applyPlan(await createPlan([sentinel], context), context)
    const original = Buffer.from('model = "user-model"\n')
    await writeFile(artifact.destination, original)
    await chmod(artifact.destination, 0o640)

    const large: Artifact = {
      ...sentinel,
      name: "large-mode-delay",
      destination: path.join(artifact.root, "large-mode-delay.bin"),
      content: Buffer.alloc(8 * 1024 * 1024, 0x62),
    }
    const plan = await createPlan([artifact, large], context)
    await writeFile(sentinel.destination, "changed after plan\n")

    let installedContent: Buffer | undefined
    const chmodFinished = (async () => {
      for (let attempt = 0; attempt < 2_000; attempt += 1) {
        const current = await readFile(artifact.destination)
        if (!current.equals(original)) {
          installedContent = current
          await chmod(artifact.destination, 0o600)
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 1))
      }
      throw new Error("La escritura administrada no fue observable durante la prueba")
    })()
    const outcome = applyPlan(plan, context).then(
      () => undefined,
      (error: unknown) => error,
    )
    await chmodFinished
    const error = await outcome
    expect(error).toBeInstanceOf(AggregateError)
    const rollbackFailure = (error as AggregateError).errors.find(
      (nested) => nested instanceof AggregateError,
    ) as AggregateError | undefined
    expect(
      rollbackFailure?.errors.some((nested) =>
        String(nested).includes("No se revierte un destino editado"),
      ),
    ).toBe(true)
    expect(await readFile(artifact.destination)).toEqual(installedContent)
    expect((await stat(artifact.destination)).mode & 0o777).toBe(0o600)
    expect(await readFile(sentinel.destination, "utf8")).toBe("changed after plan\n")
  })
})

describe("Codex Context7 adapter integration and legacy migration", () => {
  it("installs the adapter block into an existing config and preserves its bytes", async () => {
    const context = await testContext()
    const artifacts = await buildArtifacts(["codex"], context)
    const context7 = artifacts.find(
      (artifact) => artifact.name === "context7" && artifact.kind === "configuration",
    )!
    const original = Buffer.from('model = "gpt-custom"\r\napproval_policy = "on-request"')
    await mkdir(path.dirname(context7.destination), { recursive: true })
    await writeFile(context7.destination, original)
    await chmod(context7.destination, 0o640)

    await applyPlan(await createPlan([context7], context), context)
    const installed = await readFile(context7.destination)
    expect(installed.subarray(0, original.length)).toEqual(original)
    expect(installed.subarray(original.length).toString("utf8")).toBe(
      '\r\n# >>> ms-agent-kit managed-block:codex-context7 >>>\n' +
        '[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"\n' +
        'env_http_headers = { "CONTEXT7_API_KEY" = "CONTEXT7_API_KEY" }\n' +
        '# <<< ms-agent-kit managed-block:codex-context7 <<<\n',
    )
    expect((await stat(context7.destination)).mode & 0o777).toBe(0o640)
  })

  it("respects an equivalent external table and protects a conflicting one", async () => {
    const satisfiedContext = await testContext()
    const satisfiedArtifact = (await buildArtifacts(["codex"], satisfiedContext)).find(
      (artifact) => artifact.name === "context7" && artifact.kind === "configuration",
    )!
    const external =
      "# user owned\n[mcp_servers.context7]\n" +
      "env_http_headers = { 'CONTEXT7_API_KEY' = 'CONTEXT7_API_KEY' }\n" +
      "url = 'https://mcp.context7.com/mcp'\n"
    await mkdir(path.dirname(satisfiedArtifact.destination), { recursive: true })
    await writeFile(satisfiedArtifact.destination, external)

    const satisfiedPlan = await createPlan([satisfiedArtifact], satisfiedContext)
    expect(satisfiedPlan.items[0]).toEqual(
      expect.objectContaining({ action: "unchanged", satisfiedExternally: true }),
    )
    await applyPlan(satisfiedPlan, satisfiedContext)
    expect(await readFile(satisfiedArtifact.destination, "utf8")).toBe(external)
    expect((await installedState(satisfiedContext)).files).toEqual([])

    const conflictContext = await testContext()
    const conflictArtifact = (await buildArtifacts(["codex"], conflictContext)).find(
      (artifact) => artifact.name === "context7" && artifact.kind === "configuration",
    )!
    const conflict =
      '[mcp_servers.context7]\nurl = "https://private.example/mcp"\n' +
      'env_http_headers = { "CONTEXT7_API_KEY" = "materialized-value" }\n'
    await mkdir(path.dirname(conflictArtifact.destination), { recursive: true })
    await writeFile(conflictArtifact.destination, conflict)

    const forced = await createPlan([conflictArtifact], conflictContext, true)
    expect(forced.items[0]).toEqual(
      expect.objectContaining({ action: "conflict", reason: expect.stringMatching(/protegida/) }),
    )
    await expect(applyPlan(forced, conflictContext)).rejects.toThrow(/conflicto/)
    expect(await readFile(conflictArtifact.destination, "utf8")).toBe(conflict)
  })

  it("removes intact legacy metadata, skips edits and cleans absent ownership", async () => {
    const intactContext = await testContext()
    const intactLegacy = legacyCodexMetadataArtifact(intactContext)
    await applyPlan(await createPlan([intactLegacy], intactContext), intactContext)
    const intactDesired = await buildArtifacts(["codex"], intactContext)
    const intactPlan = await createPlan(intactDesired, intactContext)
    expect(intactPlan.obsolete).toContainEqual(
      expect.objectContaining({
        action: "remove",
        file: expect.objectContaining({ path: intactLegacy.destination }),
      }),
    )
    await applyPlan(intactPlan, intactContext)
    await expect(access(intactLegacy.destination)).rejects.toMatchObject({ code: "ENOENT" })
    expect((await installedState(intactContext)).files).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: intactLegacy.destination })]),
    )

    const modifiedContext = await testContext()
    const modifiedLegacy = legacyCodexMetadataArtifact(modifiedContext)
    await applyPlan(await createPlan([modifiedLegacy], modifiedContext), modifiedContext)
    const edit = "metadata editada por el usuario\n"
    await writeFile(modifiedLegacy.destination, edit)
    const modifiedPlan = await createPlan(
      await buildArtifacts(["codex"], modifiedContext),
      modifiedContext,
    )
    expect(modifiedPlan.obsolete).toContainEqual(
      expect.objectContaining({ action: "skip", file: expect.objectContaining({ path: modifiedLegacy.destination }) }),
    )
    const modifiedResult = await applyPlan(modifiedPlan, modifiedContext)
    expect(modifiedResult.skipped).toBe(1)
    expect(await readFile(modifiedLegacy.destination, "utf8")).toBe(edit)
    expect((await installedState(modifiedContext)).files).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: modifiedLegacy.destination })]),
    )

    const absentContext = await testContext()
    const absentLegacy = legacyCodexMetadataArtifact(absentContext)
    await applyPlan(await createPlan([absentLegacy], absentContext), absentContext)
    await rm(absentLegacy.destination)
    const absentPlan = await createPlan(
      await buildArtifacts(["codex"], absentContext),
      absentContext,
    )
    expect(absentPlan.obsolete).toContainEqual(
      expect.objectContaining({ action: "remove", file: expect.objectContaining({ path: absentLegacy.destination }) }),
    )
    await applyPlan(absentPlan, absentContext)
    expect((await installedState(absentContext)).files).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: absentLegacy.destination })]),
    )
  })

  it("rolls back Context7 and legacy removal when a later obsolete destination races", async () => {
    const context = await testContext()
    const legacy = legacyCodexMetadataArtifact(context)
    const sentinel = legacyCodexMetadataArtifact(context, {
      kind: "configuration",
      name: "legacy-sentinel",
      root: path.join(context.projectRoot, ".codex"),
      destination: path.join(context.projectRoot, ".codex", "zz-legacy.txt"),
      content: Buffer.from("legacy sentinel\n"),
    })
    await applyPlan(await createPlan([legacy, sentinel], context), context)
    const configPath = path.join(context.projectRoot, ".codex", "config.toml")
    const originalConfig = Buffer.from('model = "user-model"\n')
    await writeFile(configPath, originalConfig)

    const desired = await buildArtifacts(["codex"], context)
    const plan = await createPlan(desired, context)
    expect(plan.obsolete.map((item) => item.file.path)).toEqual([
      legacy.destination,
      sentinel.destination,
    ])
    await writeFile(sentinel.destination, "changed after plan\n")

    await expect(applyPlan(plan, context)).rejects.toThrow(/cambió después del plan/)
    expect(await readFile(configPath)).toEqual(originalConfig)
    expect(await readFile(legacy.destination)).toEqual(legacy.content)
    expect(await readFile(sentinel.destination, "utf8")).toBe("changed after plan\n")
    expect((await installedState(context)).files.map((file) => file.path)).toEqual([
      legacy.destination,
      sentinel.destination,
    ])
  })
})
