import { lstat, readFile, readdir, stat } from "node:fs/promises"
import path from "node:path"
import { atomicWriteFile, hashContent, readExistingFile, removeManagedFile } from "./files.js"
import { frontmatterString, parseMarkdown } from "./frontmatter.js"
import { UNIVERSAL_REGISTRY_EXCLUDED_SKILLS } from "./skill-visibility.js"

const REGISTRY_SCHEMA = "ms-skill-registry/v3"
const REGISTRY_RENDER_VERSION = 2
const LEGACY_TARGETS = ["opencode", "claude", "codex"] as const
const ATL_IGNORE_ENTRY = ".atl/"

interface ScanRoot {
  directory: string
  scope: "project" | "user"
  excludedNames?: readonly string[]
}

interface SkillEntry {
  name: string
  description: string
  scope: "project" | "user"
  path: string
  size: number
  mtimeMs: number
}

interface ConventionEntry {
  path: string
  size: number
  mtimeMs: number
}

export interface SkillRegistryResult {
  schema: typeof REGISTRY_SCHEMA
  updated: boolean
  cacheHit: boolean
  fingerprint: string
  registryPath: string
  cachePath: string
  skills: number
  conventions: string[]
}

export async function ensureAtlIgnored(projectRootInput: string): Promise<boolean> {
  const projectRoot = path.resolve(projectRootInput)
  const gitignorePath = path.join(projectRoot, ".gitignore")
  const existing = await readExistingFile(gitignorePath)
  const content = existing?.content.toString("utf8") ?? ""
  if (
    content
      .split(/\r?\n/)
      .some((line) => [".atl", ATL_IGNORE_ENTRY].includes(line.trim()))
  ) {
    return false
  }

  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : ""
  const header = content.includes("# Local AI runtime state")
    ? ""
    : "# Local AI runtime state\n"
  await atomicWriteFile(
    projectRoot,
    gitignorePath,
    Buffer.from(`${content}${separator}${header}${ATL_IGNORE_ENTRY}\n`),
    existing?.mode ?? 0o644,
  )
  return true
}

function displayPath(input: string, projectRoot: string, homeDir: string): string {
  const projectRelative = path.relative(projectRoot, input)
  if (!projectRelative.startsWith("..") && !path.isAbsolute(projectRelative)) {
    return projectRelative.replaceAll("\\", "/") || "."
  }
  const homeRelative = path.relative(homeDir, input)
  if (!homeRelative.startsWith("..") && !path.isAbsolute(homeRelative)) {
    return `~/${homeRelative.replaceAll("\\", "/")}`
  }
  return input.replaceAll("\\", "/")
}

function tableText(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\s+/g, " ").trim()
}

async function scanSkills(root: ScanRoot): Promise<SkillEntry[]> {
  let directories
  try {
    directories = await readdir(root.directory, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }

  const entries: SkillEntry[] = []
  for (const directory of directories.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!directory.isDirectory()) continue
    const skillPath = path.join(root.directory, directory.name, "SKILL.md")
    try {
      const linkInfo = await lstat(skillPath)
      if (linkInfo.isSymbolicLink() || !linkInfo.isFile()) continue
      const [raw, info] = await Promise.all([readFile(skillPath, "utf8"), stat(skillPath)])
      const parsed = parseMarkdown(raw)
      const name = frontmatterString(parsed.frontmatter, "name")
      const description = frontmatterString(parsed.frontmatter, "description")
      if (!name || !description) continue
      if (root.excludedNames?.includes(name)) continue
      entries.push({
        name,
        description,
        scope: root.scope,
        path: skillPath,
        size: info.size,
        mtimeMs: Math.trunc(info.mtimeMs),
      })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
  return entries
}

async function scanConventions(projectRoot: string): Promise<ConventionEntry[]> {
  const candidates = [
    "AGENTS.md",
    "CLAUDE.md",
    ".cursorrules",
    ".github/copilot-instructions.md",
    "docs/agents.md",
  ]
  const entries: ConventionEntry[] = []
  for (const relativePath of candidates) {
    const filePath = path.join(projectRoot, relativePath)
    try {
      const linkInfo = await lstat(filePath)
      if (linkInfo.isSymbolicLink() || !linkInfo.isFile()) continue
      const info = await stat(filePath)
      entries.push({ path: filePath, size: info.size, mtimeMs: Math.trunc(info.mtimeMs) })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
  return entries
}

function registryMarkdown(
  skills: SkillEntry[],
  conventions: ConventionEntry[],
  projectRoot: string,
  homeDir: string,
  fingerprint: string,
): string {
  const lines = [
    "# Skill Registry",
    "",
    `> Schema: ${REGISTRY_SCHEMA}`,
    `> Fingerprint: ${fingerprint}`,
    "> Precedencia: una skill de proyecto reemplaza una skill global con el mismo nombre.",
    "> Uso: índice común de skills instaladas en roots estándar de OpenCode, Claude Code y Codex.",
    "",
    "| Skill | Trigger / descripción | Scope | Ruta |",
    "|---|---|---|---|",
  ]
  for (const skill of skills) {
    lines.push(
      `| ${tableText(skill.name)} | ${tableText(skill.description)} | ${skill.scope} | \`${displayPath(skill.path, projectRoot, homeDir)}\` |`,
    )
  }
  if (skills.length === 0) lines.push("| none | No se detectaron skills | N/A | N/A |")

  lines.push("", "## Convenciones Detectadas", "")
  if (conventions.length === 0) {
    lines.push("- Ninguna.")
  } else {
    for (const convention of conventions) {
      lines.push(`- \`${displayPath(convention.path, projectRoot, homeDir)}\``)
    }
  }
  return `${lines.join("\n")}\n`
}

function scanRoots(projectRoot: string, homeDir: string): ScanRoot[] {
  const projectRoots = [
    path.join(projectRoot, "skills"),
    path.join(projectRoot, ".opencode", "skills"),
    path.join(projectRoot, ".claude", "skills"),
    path.join(projectRoot, ".codex", "skills"),
    path.join(projectRoot, ".agents", "skills"),
  ]
  const userRoots = [
    path.join(homeDir, ".agents", "skills"),
    path.join(homeDir, ".config", "opencode", "skills"),
    path.join(homeDir, ".claude", "skills"),
    path.join(homeDir, ".codex", "skills"),
  ]
  return [
    ...projectRoots.map((directory) => ({
      directory,
      scope: "project" as const,
      excludedNames: UNIVERSAL_REGISTRY_EXCLUDED_SKILLS,
    })),
    ...userRoots.map((directory) => ({
      directory,
      scope: "user" as const,
      excludedNames: UNIVERSAL_REGISTRY_EXCLUDED_SKILLS,
    })),
  ]
}

function registryPaths(projectRoot: string): { registryPath: string; cachePath: string } {
  return {
    registryPath: path.join(projectRoot, ".atl", "skill-registry.md"),
    cachePath: path.join(projectRoot, ".atl", ".skill-registry.cache.json"),
  }
}

async function removeTargetRegistries(projectRoot: string): Promise<void> {
  for (const target of LEGACY_TARGETS) {
    const registryPath = path.join(projectRoot, ".atl", `skill-registry.${target}.md`)
    const cachePath = path.join(projectRoot, ".atl", `.skill-registry.${target}.cache.json`)
    const [registry, cache] = await Promise.all([
      readExistingFile(registryPath),
      readExistingFile(cachePath),
    ])
    if (registry) {
      const content = registry.content.toString("utf8")
      if (
        content.startsWith("# Skill Registry\n") &&
        content.includes("> Schema: ms-skill-registry/v2") &&
        content.includes(`> Target: ${target}`)
      ) {
        await removeManagedFile(projectRoot, registryPath)
      }
    }
    if (cache) {
      try {
        const parsed = JSON.parse(cache.content.toString("utf8")) as {
          schema?: string
          target?: string
        }
        if (parsed.schema === "ms-skill-registry/v2" && parsed.target === target) {
          await removeManagedFile(projectRoot, cachePath)
        }
      } catch {
        // Un archivo ajeno o inválido se conserva.
      }
    }
  }
}

export async function refreshSkillRegistry(input: {
  projectRoot: string
  homeDir: string
  force?: boolean
}): Promise<SkillRegistryResult> {
  const projectRoot = path.resolve(input.projectRoot)
  const homeDir = path.resolve(input.homeDir)
  const roots = scanRoots(projectRoot, homeDir)
  const [scannedGroups, conventions] = await Promise.all([
    Promise.all(roots.map(scanSkills)),
    scanConventions(projectRoot),
  ])
  const selected = new Map<string, SkillEntry>()
  for (const skill of scannedGroups.flat()) {
    if (!selected.has(skill.name)) selected.set(skill.name, skill)
  }
  const skills = [...selected.values()].sort((left, right) => left.name.localeCompare(right.name))
  const fingerprint = hashContent(
    JSON.stringify({
      schema: REGISTRY_SCHEMA,
      renderVersion: REGISTRY_RENDER_VERSION,
      skills: skills.map(({ name, description, scope, path: filePath, size, mtimeMs }) => ({
        name,
        description,
        scope,
        path: filePath,
        size,
        mtimeMs,
      })),
      conventions,
    }),
  )
  const { registryPath, cachePath } = registryPaths(projectRoot)
  const [existingRegistry, existingCache] = await Promise.all([
    readExistingFile(registryPath),
    readExistingFile(cachePath),
  ])
  let cacheFingerprint: string | null = null
  if (existingCache) {
    try {
      const cache = JSON.parse(existingCache.content.toString("utf8")) as {
        schema?: string
        fingerprint?: string
      }
      if (cache.schema === REGISTRY_SCHEMA && typeof cache.fingerprint === "string") {
        cacheFingerprint = cache.fingerprint
      }
    } catch {
      // Un cache inválido se reemplaza de forma segura.
    }
  }

  const cacheHit = !input.force && existingRegistry !== null && cacheFingerprint === fingerprint
  if (!cacheHit) {
    await atomicWriteFile(
      projectRoot,
      registryPath,
      Buffer.from(registryMarkdown(skills, conventions, projectRoot, homeDir, fingerprint)),
      0o644,
    )
    await atomicWriteFile(
      projectRoot,
      cachePath,
      Buffer.from(
        `${JSON.stringify({ schema: REGISTRY_SCHEMA, fingerprint }, null, 2)}\n`,
      ),
      0o600,
    )
  }
  await removeTargetRegistries(projectRoot)

  return {
    schema: REGISTRY_SCHEMA,
    updated: !cacheHit,
    cacheHit,
    fingerprint,
    registryPath,
    cachePath,
    skills: skills.length,
    conventions: conventions.map((entry) => displayPath(entry.path, projectRoot, homeDir)),
  }
}
