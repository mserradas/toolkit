/** Refresca el índice de skills del proyecto al iniciar OpenCode, con cache por huella. */

import { tool, type Plugin } from "@opencode-ai/plugin"
import { createHash, randomBytes } from "crypto"
import { chmod, lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "fs/promises"
import { homedir } from "os"
import path from "path"

const SCHEMA = "ms-skill-registry/v3"
const RENDER_VERSION = 2
const LEGACY_TARGETS = ["opencode", "claude", "codex"] as const
const EXCLUDED_REGISTRY_SKILLS = new Set([
  "skill-registry",
  "ms-architect",
  "ms-continue",
  "ms-doctor",
  "ms-models",
  "ms-shared",
  "ms-skill-creator",
  "ms-skills",
  "ms-status",
])

type SkillEntry = {
  name: string
  description: string
  scope: "project" | "user"
  path: string
  size: number
  mtimeMs: number
}

function frontmatterValue(raw: string, key: string): string | null {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw)?.[1]
  if (!frontmatter) return null
  const lines = frontmatter.split(/\r?\n/)
  const index = lines.findIndex((line) => line.startsWith(`${key}:`))
  if (index < 0) return null
  const value = lines[index]!.slice(key.length + 1).trim()
  if ([">", ">-", "|", "|-"].includes(value)) {
    const block: string[] = []
    for (const line of lines.slice(index + 1)) {
      if (line && !/^\s/.test(line)) break
      if (line.trim()) block.push(line.trim())
    }
    const separator = value.startsWith(">") ? " " : "\n"
    return block.join(separator).trim() || null
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed = JSON.parse(value)
      return typeof parsed === "string" && parsed.trim() ? parsed.trim() : null
    } catch {
      return null
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'").trim() || null
  }
  return value.trim() || null
}

async function scanRoot(
  directory: string,
  scope: "project" | "user",
): Promise<SkillEntry[]> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }

  const skills: SkillEntry[] = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue
    const skillPath = path.join(directory, entry.name, "SKILL.md")
    try {
      const linkInfo = await lstat(skillPath)
      if (linkInfo.isSymbolicLink() || !linkInfo.isFile()) continue
      const [raw, info] = await Promise.all([readFile(skillPath, "utf8"), stat(skillPath)])
      const name = frontmatterValue(raw, "name")
      const description = frontmatterValue(raw, "description")
      if (!name || !description) continue
      if (EXCLUDED_REGISTRY_SKILLS.has(name)) continue
      skills.push({
        name,
        description,
        scope,
        path: skillPath,
        size: info.size,
        mtimeMs: Math.trunc(info.mtimeMs),
      })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
  return skills
}

async function conventions(projectRoot: string) {
  const output: Array<{ path: string; size: number; mtimeMs: number }> = []
  for (const relativePath of [
    "AGENTS.md",
    "CLAUDE.md",
    ".cursorrules",
    ".github/copilot-instructions.md",
    "docs/agents.md",
  ]) {
    const filePath = path.join(projectRoot, relativePath)
    try {
      const linkInfo = await lstat(filePath)
      if (linkInfo.isSymbolicLink() || !linkInfo.isFile()) continue
      const info = await stat(filePath)
      output.push({ path: filePath, size: info.size, mtimeMs: Math.trunc(info.mtimeMs) })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
  return output
}

function displayPath(input: string, projectRoot: string, home: string): string {
  const projectRelative = path.relative(projectRoot, input)
  if (!projectRelative.startsWith("..") && !path.isAbsolute(projectRelative)) {
    return projectRelative.replaceAll("\\", "/")
  }
  const homeRelative = path.relative(home, input)
  return !homeRelative.startsWith("..") && !path.isAbsolute(homeRelative)
    ? `~/${homeRelative.replaceAll("\\", "/")}`
    : input.replaceAll("\\", "/")
}

function table(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\s+/g, " ").trim()
}

async function atomicWrite(root: string, destination: string, content: string, mode: number) {
  await mkdir(root, { recursive: true })
  const rootInfo = await lstat(root)
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
    throw new Error(".atl no es un directorio regular")
  }
  const temporary = path.join(root, `.ms-skill-registry.${randomBytes(4).toString("hex")}.tmp`)
  try {
    await writeFile(temporary, content, { mode })
    await chmod(temporary, mode)
    await rename(temporary, destination)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

async function ensureAtlIgnored(projectRoot: string) {
  const gitignorePath = path.join(projectRoot, ".gitignore")
  let content = ""
  let mode = 0o644
  try {
    const info = await lstat(gitignorePath)
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error(".gitignore no es un archivo regular")
    }
    content = await readFile(gitignorePath, "utf8")
    mode = info.mode & 0o777
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  if (content.split(/\r?\n/).some((line) => [".atl", ".atl/"].includes(line.trim()))) {
    return false
  }

  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : ""
  const header = content.includes("# Local AI runtime state")
    ? ""
    : "# Local AI runtime state\n"
  await atomicWrite(
    projectRoot,
    gitignorePath,
    `${content}${separator}${header}.atl/\n`,
    mode,
  )
  return true
}

async function refreshExistingProjectSkillRegistry(projectRoot: string) {
  const registryPath = path.join(projectRoot, ".atl", "skill-registry.md")
  try {
    const info = await lstat(registryPath)
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error("El skill registry no es un archivo regular")
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
  return refreshProjectSkillRegistry(projectRoot)
}

async function removeTargetRegistries(atlRoot: string) {
  for (const target of LEGACY_TARGETS) {
    const registryPath = path.join(atlRoot, `skill-registry.${target}.md`)
    const cachePath = path.join(atlRoot, `.skill-registry.${target}.cache.json`)
    try {
      const info = await lstat(registryPath)
      if (!info.isSymbolicLink() && info.isFile()) {
        const content = await readFile(registryPath, "utf8")
        if (
          content.startsWith("# Skill Registry\n") &&
          content.includes("> Schema: ms-skill-registry/v2") &&
          content.includes(`> Target: ${target}`)
        ) {
          await rm(registryPath)
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    try {
      const info = await lstat(cachePath)
      if (!info.isSymbolicLink() && info.isFile()) {
        const cache = JSON.parse(await readFile(cachePath, "utf8"))
        if (cache?.schema === "ms-skill-registry/v2" && cache?.target === target) {
          await rm(cachePath)
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError)) {
        throw error
      }
    }
  }
}

async function refreshProjectSkillRegistry(
  projectRootInput: string,
  home = homedir(),
  force = false,
) {
  const projectRoot = path.resolve(projectRootInput)
  const roots = [
    [path.join(projectRoot, "skills"), "project"],
    [path.join(projectRoot, ".opencode", "skills"), "project"],
    [path.join(projectRoot, ".claude", "skills"), "project"],
    [path.join(projectRoot, ".codex", "skills"), "project"],
    [path.join(projectRoot, ".agents", "skills"), "project"],
    [path.join(home, ".agents", "skills"), "user"],
    [path.join(home, ".config", "opencode", "skills"), "user"],
    [path.join(home, ".claude", "skills"), "user"],
    [path.join(home, ".codex", "skills"), "user"],
  ] as const
  const [groups, detectedConventions] = await Promise.all([
    Promise.all(
      roots.map(([directory, scope]) => scanRoot(directory, scope)),
    ),
    conventions(projectRoot),
  ])
  const selected = new Map<string, SkillEntry>()
  for (const skill of groups.flat()) if (!selected.has(skill.name)) selected.set(skill.name, skill)
  const skills = [...selected.values()].sort((left, right) => left.name.localeCompare(right.name))
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        schema: SCHEMA,
        renderVersion: RENDER_VERSION,
        skills,
        conventions: detectedConventions,
      }),
    )
    .digest("hex")
  const atlRoot = path.join(projectRoot, ".atl")
  const registryPath = path.join(atlRoot, "skill-registry.md")
  const cachePath = path.join(atlRoot, ".skill-registry.cache.json")
  await removeTargetRegistries(atlRoot)

  try {
    const cacheInfo = await lstat(cachePath)
    if (cacheInfo.isSymbolicLink() || !cacheInfo.isFile()) {
      throw new Error("El cache de skill registry no es un archivo regular")
    }
    const cache = JSON.parse(await readFile(cachePath, "utf8"))
    const registryInfo = await lstat(registryPath)
    if (registryInfo.isSymbolicLink()) throw new Error("El skill registry no puede ser un symlink")
    if (
      !force &&
      cache?.schema === SCHEMA &&
      cache?.fingerprint === fingerprint &&
      registryInfo.isFile()
    ) {
      return { cacheHit: true, skills: skills.length, fingerprint }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError)) throw error
  }

  const lines = [
    "# Skill Registry",
    "",
    `> Schema: ${SCHEMA}`,
    `> Fingerprint: ${fingerprint}`,
    "> Precedencia: una skill de proyecto reemplaza una skill global con el mismo nombre.",
    "> Uso: índice común de skills instaladas en roots estándar de OpenCode, Claude Code y Codex.",
    "",
    "| Skill | Trigger / descripción | Scope | Ruta |",
    "|---|---|---|---|",
    ...skills.map(
      (skill) =>
        `| ${table(skill.name)} | ${table(skill.description)} | ${skill.scope} | \`${displayPath(skill.path, projectRoot, home)}\` |`,
    ),
    "",
    "## Convenciones Detectadas",
    "",
    ...(detectedConventions.length > 0
      ? detectedConventions.map((entry) => `- \`${displayPath(entry.path, projectRoot, home)}\``)
      : ["- Ninguna."]),
    "",
  ]
  await atomicWrite(atlRoot, registryPath, lines.join("\n"), 0o644)
  await atomicWrite(
    atlRoot,
    cachePath,
    `${JSON.stringify({ schema: SCHEMA, fingerprint }, null, 2)}\n`,
    0o600,
  )
  return { cacheHit: false, skills: skills.length, fingerprint }
}

const skillRegistryPlugin: Plugin = async (input) => {
  const projectRoot = input.worktree || input.directory
  const startupRefresh = await refreshExistingProjectSkillRegistry(projectRoot).catch((error) => {
    console.error("[ms-skill-registry] refresh failed:", error)
    return null
  })
  return {
    async config(config) {
      const portableSkills = await scanRoot(
        path.join(projectRoot, ".agents", "skills"),
        "project",
      )
      if (portableSkills.length === 0) return
      config.skills ??= {}
      config.skills.paths ??= []
      for (const skill of portableSkills) {
        const skillDirectory = path.dirname(skill.path)
        if (!config.skills.paths.includes(skillDirectory)) {
          config.skills.paths.push(skillDirectory)
        }
      }
    },
    tool: {
      ms_skill_registry_refresh: tool({
        description: "Refresca el índice común de skills instaladas en roots estándar.",
        args: {
          force: tool.schema
            .boolean()
            .optional()
            .default(false)
            .describe("Ignora la cache y reescribe el registro."),
        },
        async execute(args) {
          await startupRefresh
          await ensureAtlIgnored(projectRoot)
          const result = await refreshProjectSkillRegistry(
            projectRoot,
            homedir(),
            args.force,
          )
          return {
            title: result.cacheHit ? "Skill registry sin cambios" : "Skill registry actualizado",
            output: JSON.stringify(
              {
                schema: SCHEMA,
                cacheHit: result.cacheHit,
                skills: result.skills,
                fingerprint: result.fingerprint,
                registry: ".atl/skill-registry.md",
              },
              null,
              2,
            ),
            metadata: result,
          }
        },
      }),
    },
  }
}

const MsSkillRegistryPlugin = Object.assign(skillRegistryPlugin, {
  __test: { refreshProjectSkillRegistry },
})

export default MsSkillRegistryPlugin
