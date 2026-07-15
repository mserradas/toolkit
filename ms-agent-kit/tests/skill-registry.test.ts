import { access, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import MsSkillRegistryPlugin from "../assets/opencode/plugins/ms-skill-registry.js"
import { ensureAtlIgnored, refreshSkillRegistry } from "../src/core/skill-registry.js"

const { refreshProjectSkillRegistry } = MsSkillRegistryPlugin.__test

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

async function skill(root: string, name: string, description: string): Promise<void> {
  const directory = path.join(root, name)
  await mkdir(directory, { recursive: true })
  await writeFile(
    path.join(directory, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
  )
}

describe("universal skill registry", () => {
  it("prefers project skills, caches unchanged scans, and refreshes atomically", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-registry-"))
    temporaryDirectories.push(root)
    const projectRoot = path.join(root, "project")
    const homeDir = path.join(root, "home")
    const projectSkills = path.join(projectRoot, ".agents", "skills")
    const userSkills = path.join(homeDir, ".agents", "skills")
    await skill(userSkills, "shared", "Global description")
    await skill(userSkills, "global-only", "Only global")
    await skill(projectSkills, "shared", "Project description")
    await writeFile(path.join(projectRoot, "AGENTS.md"), "# Conventions\n")

    const first = await refreshSkillRegistry({ projectRoot, homeDir })
    const registry = await readFile(first.registryPath, "utf8")
    expect(first).toMatchObject({
      schema: "ms-skill-registry/v3",
      updated: true,
      cacheHit: false,
      skills: 2,
      conventions: ["AGENTS.md"],
    })
    expect(first.registryPath).toBe(path.join(projectRoot, ".atl", "skill-registry.md"))
    expect(registry).toContain("Project description")
    expect(registry).not.toContain("Global description")
    expect(registry).not.toContain("> Target:")
    expect((await stat(first.registryPath)).mode & 0o777).toBe(0o644)
    expect((await stat(first.cachePath)).mode & 0o777).toBe(0o600)

    const second = await refreshSkillRegistry({ projectRoot, homeDir })
    expect(second).toMatchObject({ updated: false, cacheHit: true, fingerprint: first.fingerprint })

    await skill(projectSkills, "shared", "Updated project description with a new size")
    const third = await refreshSkillRegistry({ projectRoot, homeDir })
    expect(third).toMatchObject({ updated: true, cacheHit: false })
    expect(third.fingerprint).not.toBe(first.fingerprint)
    expect(await readFile(third.registryPath, "utf8")).toContain("Updated project description")
  })

  it("keeps the OpenCode plugin aligned and removes managed target variants", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-plugin-registry-"))
    temporaryDirectories.push(root)
    const projectRoot = path.join(root, "project")
    const homeDir = path.join(root, "home")
    const skillDirectory = path.join(projectRoot, ".opencode", "skills", "folded")
    await mkdir(skillDirectory, { recursive: true })
    await writeFile(
      path.join(skillDirectory, "SKILL.md"),
      "---\nname: folded\ndescription: >-\n  First line for the trigger.\n  Second line for details.\n---\n\n# Folded\n",
    )
    await skill(path.join(projectRoot, ".agents", "skills"), "portable-project", "Portable project skill")
    await skill(path.join(projectRoot, ".agents", "skills"), "ms-architect", "Internal workflow")
    await mkdir(path.join(projectRoot, ".atl"), { recursive: true })
    for (const target of ["opencode", "claude", "codex"]) {
      await writeFile(
        path.join(projectRoot, ".atl", `skill-registry.${target}.md`),
        `# Skill Registry\n\n> Schema: ms-skill-registry/v2\n> Target: ${target}\n`,
      )
      await writeFile(
        path.join(projectRoot, ".atl", `.skill-registry.${target}.cache.json`),
        `${JSON.stringify({ schema: "ms-skill-registry/v2", target, fingerprint: "legacy" })}\n`,
      )
    }

    const first = await refreshProjectSkillRegistry(projectRoot, homeDir)
    expect(first).toMatchObject({ cacheHit: false, skills: 2 })
    const registryPath = path.join(projectRoot, ".atl", "skill-registry.md")
    const registry = await readFile(registryPath, "utf8")
    expect(registry).toContain("> Schema: ms-skill-registry/v3")
    expect(registry).not.toContain("> Target:")
    expect(registry).toContain("First line for the trigger. Second line for details.")
    expect(registry).toContain("portable-project")
    expect(registry).not.toContain("ms-architect")
    const coreResult = await refreshSkillRegistry({ projectRoot, homeDir })
    expect(coreResult).toMatchObject({ cacheHit: true, fingerprint: first.fingerprint })
    for (const target of ["opencode", "claude", "codex"]) {
      await expect(
        access(path.join(projectRoot, ".atl", `skill-registry.${target}.md`)),
      ).rejects.toMatchObject({ code: "ENOENT" })
      await expect(
        access(path.join(projectRoot, ".atl", `.skill-registry.${target}.cache.json`)),
      ).rejects.toMatchObject({ code: "ENOENT" })
    }
    expect(await refreshProjectSkillRegistry(projectRoot, homeDir)).toMatchObject({ cacheHit: true })
    expect(await refreshProjectSkillRegistry(projectRoot, homeDir, true)).toMatchObject({ cacheHit: false })

    const hooks = await MsSkillRegistryPlugin({ directory: projectRoot, worktree: projectRoot } as never)
    const config = {} as { skills?: { paths?: string[] } }
    await hooks.config?.(config as never)
    expect(config.skills?.paths).toContain(path.join(projectRoot, ".agents", "skills", "portable-project"))
    expect(config.skills?.paths).not.toContain(path.join(projectRoot, ".agents", "skills", "ms-architect"))
    const refreshTool = hooks.tool?.ms_skill_registry_refresh
    expect(refreshTool).toBeDefined()
    const toolResult = await refreshTool!.execute({ force: true }, { directory: projectRoot } as never)
    expect(toolResult).toMatchObject({ title: "Skill registry actualizado" })
    if (typeof toolResult === "string") throw new Error("La herramienta debe devolver salida estructurada")
    const toolPayload = JSON.parse(toolResult.output) as Record<string, unknown>
    expect(toolPayload).toMatchObject({
      schema: "ms-skill-registry/v3",
      cacheHit: false,
      registry: ".atl/skill-registry.md",
    })
    expect(toolPayload).not.toHaveProperty("target")

    const cachePath = path.join(projectRoot, ".atl", ".skill-registry.cache.json")
    const external = path.join(root, "external-cache.json")
    await rm(cachePath)
    await writeFile(external, "{}\n")
    await symlink(external, cachePath)
    await expect(refreshProjectSkillRegistry(projectRoot, homeDir)).rejects.toThrow(
      "no es un archivo regular",
    )
  })

  it("initializes .atl only after an explicit OpenCode tool call", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-registry-opt-in-"))
    temporaryDirectories.push(root)
    const projectRoot = path.join(root, "project")
    await skill(path.join(projectRoot, ".agents", "skills"), "project-skill", "Project skill")

    const hooks = await MsSkillRegistryPlugin({ directory: projectRoot, worktree: projectRoot } as never)
    await expect(
      access(path.join(projectRoot, ".atl", "skill-registry.md")),
    ).rejects.toMatchObject({ code: "ENOENT" })

    const refreshTool = hooks.tool?.ms_skill_registry_refresh
    expect(refreshTool).toBeDefined()
    await refreshTool!.execute({ force: false }, { directory: projectRoot } as never)
    expect(await readFile(path.join(projectRoot, ".gitignore"), "utf8")).toContain(".atl/\n")
    expect(await readFile(path.join(projectRoot, ".atl", "skill-registry.md"), "utf8")).toContain(
      "project-skill",
    )
  })

  it("indexes all client roots once and excludes internal workflow skills", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-universal-registry-"))
    temporaryDirectories.push(root)
    const projectRoot = path.join(root, "project")
    const homeDir = path.join(root, "home")
    await skill(path.join(projectRoot, "skills"), "portable", "Portable project skill")
    await skill(path.join(projectRoot, ".opencode", "skills"), "open-only", "OpenCode project")
    await skill(path.join(projectRoot, ".claude", "skills"), "claude-only", "Claude project")
    await skill(path.join(projectRoot, ".codex", "skills"), "codex-only", "Codex project")
    await skill(path.join(projectRoot, ".agents", "skills"), "portable-agent", "Portable agent skill")
    await skill(path.join(projectRoot, ".agents", "skills"), "shared", "Project wins")
    await skill(path.join(projectRoot, ".agents", "skills"), "ms-architect", "Internal workflow")
    await skill(path.join(projectRoot, ".agents", "skills"), "skill-registry", "Internal registry")
    await skill(path.join(homeDir, ".agents", "skills"), "shared", "Global loses")
    await skill(path.join(homeDir, ".agents", "skills"), "agent-user", "Generic user")
    await skill(path.join(homeDir, ".config", "opencode", "skills"), "open-user", "OpenCode user")
    await skill(path.join(homeDir, ".claude", "skills"), "claude-user", "Claude user")
    await skill(path.join(homeDir, ".codex", "skills"), "codex-user", "Codex user")

    const result = await refreshSkillRegistry({ projectRoot, homeDir })
    const registry = await readFile(result.registryPath, "utf8")
    expect(result.skills).toBe(10)
    for (const name of [
      "portable",
      "open-only",
      "claude-only",
      "codex-only",
      "portable-agent",
      "shared",
      "agent-user",
      "open-user",
      "claude-user",
      "codex-user",
    ]) {
      expect(registry).toContain(name)
    }
    expect(registry).toContain("Project wins")
    expect(registry).not.toContain("Global loses")
    expect(registry).not.toContain("ms-architect")
    expect(registry).not.toContain("Internal registry")
  })

  it("adds .atl to gitignore once", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-gitignore-"))
    temporaryDirectories.push(root)
    await writeFile(path.join(root, ".gitignore"), "dist/\n")

    expect(await ensureAtlIgnored(root)).toBe(true)
    expect(await ensureAtlIgnored(root)).toBe(false)
    const content = await readFile(path.join(root, ".gitignore"), "utf8")
    expect(content).toBe("dist/\n# Local AI runtime state\n.atl/\n")
  })
})
