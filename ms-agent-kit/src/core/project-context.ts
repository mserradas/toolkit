import { constants } from "node:fs"
import { link, lstat, open, readdir, rename, rm } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import path from "node:path"
import YAML from "yaml"
import { AppError, throwIfAborted } from "./errors.js"
import { atomicWriteFile, hashContent } from "./files.js"
import { acquireOperationLock } from "./operation-lock.js"
import { assertNoEmbeddedSecrets } from "./security.js"

export interface ProjectPreferences {
  documentation: { language: string; paths: string[] }
  technicalSkills: string[]
}

export interface ProjectCommand { command: string; cwd: string; source: string }
export interface ProjectFile {
  schemaVersion: 1
  preferences: ProjectPreferences
  context: {
    stack: string[]
    packageManager: string | null
    modules: Array<{ path: string; stack: string[] }>
    commands: Record<CommandKind, ProjectCommand[]>
    sources: Array<{ path: string; sha256: string }>
  }
}

const COMMANDS = ["test", "lint", "typecheck", "build", "format"] as const
type CommandKind = typeof COMMANDS[number]
const PROJECT_PATH = ".agents/project.yaml"
const MAX_BYTES = 256 * 1024
const MAX_MODULES = 64
const SOURCE_NAMES = ["package.json", "pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lock", "bun.lockb", "pyproject.toml", "uv.lock", "poetry.lock"]
const SOURCE_LIMIT = 4 * 1024 * 1024

function invalid(message: string): never {
  throw new AppError("STATE_INVALID", `Contexto de proyecto inválido: ${message}`, 4)
}

function record(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(label)
  const result = value as Record<string, unknown>
  if (Object.keys(result).some((key) => !keys.includes(key)) || keys.some((key) => !(key in result))) invalid(`${label}: campos incompatibles`)
  return result
}

function list(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > 1024) invalid(label)
  return value
}

function string(value: unknown, label: string, max = 512): string {
  if (typeof value !== "string" || !value || value.length > max || /[\x00-\x1f\x7f]/.test(value)) invalid(label)
  assertNoEmbeddedSecrets(value, label)
  return value
}

function relativePath(value: unknown, label: string, allowRoot = false): string {
  const result = string(value, label)
  if (allowRoot && result === ".") return result
  if (path.posix.isAbsolute(result) || path.win32.isAbsolute(result) || /[\\*?\[\]{}:]/.test(result)) invalid(label)
  const parts = result.split("/")
  if (parts.some((part) => !part || part === "." || part === ".." || /^(?:\.git|\.codex|\.claude|\.opencode|\.ms-agent-kit|settings|secrets?|credentials?|\.env(?:\..*)?)$/i.test(part))) invalid(label)
  return result
}

function strings(value: unknown, label: string): string[] {
  return list(value, label).map((item) => string(item, label))
}

function validateProject(value: unknown): ProjectFile {
  const root = record(value, ["schemaVersion", "preferences", "context"], "documento")
  if (root.schemaVersion !== 1) invalid("schemaVersion no soportada")
  const preferences = record(root.preferences, ["documentation", "technicalSkills"], "preferences")
  const documentation = record(preferences.documentation, ["language", "paths"], "documentation")
  const language = string(documentation.language, "language", 35)
  if (!/^(?:inherit|[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*)$/.test(language)) invalid("language")
  const paths = list(documentation.paths, "documentation.paths").map((item) => {
    const result = relativePath(item, "documentation.paths")
    if (/\.[a-z0-9]+$/i.test(result) || result.split("/").some((part) => part.startsWith("."))) invalid("documentation.paths debe contener directorios explícitos")
    return result
  })
  const technicalSkills = list(preferences.technicalSkills, "technicalSkills").map((item) => relativePath(item, "technicalSkills"))
  const context = record(root.context, ["stack", "packageManager", "modules", "commands", "sources"], "context")
  const commands = record(context.commands, [...COMMANDS], "commands")
  const parsedCommands = Object.fromEntries(COMMANDS.map((kind) => [kind, list(commands[kind], kind).map((item) => {
    const command = record(item, ["command", "cwd", "source"], kind)
    return { command: string(command.command, "command"), cwd: relativePath(command.cwd, "cwd", true), source: relativePath(command.source, "source") }
  })])) as ProjectFile["context"]["commands"]
  const sources = list(context.sources, "sources").map((item) => {
    const source = record(item, ["path", "sha256"], "source")
    const sourcePath = relativePath(source.path, "source.path")
    if (!SOURCE_NAMES.includes(path.posix.basename(sourcePath))) invalid("source.path no admitida")
    const sha256 = string(source.sha256, "sha256")
    if (!/^[a-f0-9]{64}$/.test(sha256)) invalid("sha256")
    return { path: sourcePath, sha256 }
  })
  if (new Set(sources.map((source) => source.path)).size !== sources.length) invalid("sources duplicadas")
  return {
    schemaVersion: 1,
    preferences: { documentation: { language, paths }, technicalSkills },
    context: {
      stack: strings(context.stack, "stack"),
      packageManager: context.packageManager === null ? null : string(context.packageManager, "packageManager"),
      modules: list(context.modules, "modules").map((item) => {
        const module = record(item, ["path", "stack"], "module")
        return { path: relativePath(module.path, "module.path", true), stack: strings(module.stack, "module.stack") }
      }),
      commands: parsedCommands,
      sources,
    },
  }
}

// Se comprueban todos los componentes dentro de la raíz, también symlinks internos.
async function safePath(root: string, relative: string): Promise<string> {
  const info = await lstat(root)
  if (!info.isDirectory() || info.isSymbolicLink()) invalid("la raíz debe ser un directorio sin symlink")
  let current = root
  for (const part of relative.split("/")) {
    current = path.join(current, part)
    try {
      if ((await lstat(current)).isSymbolicLink()) invalid(`symlink en ${relative}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
  return current
}

async function readSafe(root: string, relative: string, maxBytes = MAX_BYTES): Promise<Buffer | null> {
  const location = await safePath(root, relative)
  let handle
  try {
    handle = await open(location, constants.O_RDONLY | constants.O_NOFOLLOW)
    const info = await handle.stat()
    if (!info.isFile() || info.size > maxBytes) invalid(`${relative}: tamaño o tipo no admitido`)
    const content = Buffer.alloc(maxBytes + 1)
    let length = 0
    while (length < content.length) {
      const { bytesRead } = await handle.read(content, length, content.length - length)
      if (!bytesRead) break
      length += bytesRead
    }
    if (length > maxBytes) invalid(`${relative}: tamaño excedido`)
    return content.subarray(0, length)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  } finally {
    await handle?.close()
  }
}

function parseProject(content: Buffer): { project: ProjectFile; document: YAML.Document } {
  const document = YAML.parseDocument(content.toString("utf8"), { uniqueKeys: true })
  if (document.errors.length) invalid("YAML inválido")
  YAML.visit(document, { Alias() { invalid("aliases YAML no permitidos") } })
  return { project: validateProject(document.toJS({ maxAliasCount: 0 })), document }
}

export async function readProjectFile(projectRoot: string): Promise<ProjectFile | null> {
  const content = await readSafe(path.resolve(projectRoot), PROJECT_PATH)
  return content === null ? null : parseProject(content).project
}

async function modulePaths(root: string): Promise<string[]> {
  const modules = ["."]
  for (const directory of ["apps", "packages", "services"]) {
    await safePath(root, directory)
    try {
      const entries = await readdir(path.join(root, directory), { withFileTypes: true })
      if (entries.length > 256) invalid(`${directory}: demasiadas entradas para descubrimiento acotado`)
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue
        modules.push(relativePath(`${directory}/${entry.name}`, "module.path"))
        if (modules.length > MAX_MODULES) invalid("demasiados módulos para descubrimiento acotado")
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
  return modules
}

async function discover(root: string, signal?: AbortSignal): Promise<ProjectFile["context"]> {
  const context: ProjectFile["context"] = {
    stack: [], packageManager: null, modules: [],
    commands: { test: [], lint: [], typecheck: [], build: [], format: [] }, sources: [],
  }
  for (const modulePath of await modulePaths(root)) {
    throwIfAborted(signal)
    const files = new Map<string, Buffer>()
    for (const name of SOURCE_NAMES) {
      const source = modulePath === "." ? name : `${modulePath}/${name}`
      const content = await readSafe(root, source, SOURCE_LIMIT)
      if (content === null) continue
      files.set(name, content)
      context.sources.push({ path: source, sha256: hashContent(content) })
    }
    const stack: string[] = []
    const source = (name: string): string => modulePath === "." ? name : `${modulePath}/${name}`
    if (files.has("package.json")) {
      let manifest: Record<string, unknown>
      try {
        const parsed: unknown = JSON.parse(files.get("package.json")!.toString("utf8"))
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) invalid(`${source("package.json")}: objeto esperado`)
        manifest = parsed as Record<string, unknown>
      } catch { invalid(`${source("package.json")}: JSON inválido`) }
      stack.push("node")
      const scripts = manifest.scripts
      if (scripts !== undefined && (!scripts || typeof scripts !== "object" || Array.isArray(scripts))) invalid(`${source("package.json")}: scripts inválidos`)
      const explicitManager = typeof manifest.packageManager === "string" ? /^(npm|pnpm|yarn|bun)(?:@[^\s]+)?$/.exec(manifest.packageManager)?.[1] : undefined
      const manager = explicitManager ?? (files.has("pnpm-lock.yaml") ? "pnpm" : files.has("yarn.lock") ? "yarn" : files.has("bun.lock") || files.has("bun.lockb") ? "bun" : "npm")
      if (modulePath === ".") context.packageManager = manager
      const declaredScripts = (scripts ?? {}) as Record<string, unknown>
      for (const kind of COMMANDS) {
        const candidates = kind === "typecheck" ? ["typecheck", "type-check", "check:types"] : kind === "format" ? ["format:check", "check:format", "format"] : [kind]
        let script = candidates.find((name) => typeof declaredScripts[name] === "string")
        if (!script && kind === "typecheck" && typeof declaredScripts.check === "string" && /^(?:tsc\b[^;&|\r\n]*\s--noEmit(?:\s|$)|(?:mypy|pyright)\b)/.test(declaredScripts.check.trim())) script = "check"
        if (script) context.commands[kind].push({ command: `${manager} run ${script}`, cwd: modulePath, source: source("package.json") })
      }
    }
    if (files.has("pyproject.toml")) {
      stack.push("python")
      const pyproject = files.get("pyproject.toml")!.toString("utf8")
      const manager = files.has("uv.lock") ? "uv" : files.has("poetry.lock") || /^\s*\[tool\.poetry\]\s*$/m.test(pyproject) ? "poetry" : null
      if (modulePath === "." && context.packageManager === null) context.packageManager = manager
      // Solo se sugieren herramientas que tienen una sección declarada; no se evalúa TOML.
      for (const [section, kind, command] of [["pytest.ini_options", "test", "pytest"], ["ruff", "lint", "ruff check ."], ["mypy", "typecheck", "mypy ."], ["black", "format", "black --check ."]] as const) {
        if (pyproject.split(/\r?\n/).some((line) => line.trim() === `[tool.${section}]`)) context.commands[kind].push({ command: `${manager ? `${manager} run ` : ""}${command}`, cwd: modulePath, source: source("pyproject.toml") })
      }
    }
    if (stack.length) context.modules.push({ path: modulePath, stack })
    for (const item of stack) if (!context.stack.includes(item)) context.stack.push(item)
  }
  context.sources.sort((a, b) => a.path.localeCompare(b.path))
  return context
}

function changedSources(before: ProjectFile["context"]["sources"], after: ProjectFile["context"]["sources"]): string[] {
  const oldHashes = new Map(before.map((item) => [item.path, item.sha256]))
  const newHashes = new Map(after.map((item) => [item.path, item.sha256]))
  return [...new Set([...oldHashes.keys(), ...newHashes.keys()])].filter((name) => oldHashes.get(name) !== newHashes.get(name)).sort()
}

export async function inspectProjectContext(projectRoot: string): Promise<{ status: "missing" | "current" | "stale"; changedSources: string[]; project: ProjectFile | null }> {
  const root = path.resolve(projectRoot)
  const project = await readProjectFile(root)
  if (!project) return { status: "missing", changedSources: [], project: null }
  const changes = changedSources(project.context.sources, (await discover(root)).sources)
  return { status: changes.length ? "stale" : "current", changedSources: changes, project }
}

export async function initializeProjectContext(projectRoot: string, options: { dryRun?: boolean; signal?: AbortSignal } = {}): Promise<{ action: "created" | "updated" | "unchanged"; path: string; project: ProjectFile }> {
  const root = path.resolve(projectRoot)
  throwIfAborted(options.signal)
  await safePath(root, PROJECT_PATH)
  const apply = async () => {
    const before = await readSafe(root, PROJECT_PATH)
    const parsed = before === null ? null : parseProject(before)
    const project: ProjectFile = {
      schemaVersion: 1,
      preferences: parsed?.project.preferences ?? { documentation: { language: "inherit", paths: [] }, technicalSkills: [] },
      context: await discover(root, options.signal),
    }
    validateProject(project)
    const action = parsed && JSON.stringify(parsed.project) === JSON.stringify(project) ? "unchanged" : parsed ? "updated" : "created"
    const location = path.join(root, PROJECT_PATH)
    if (action === "unchanged" || options.dryRun) return { action, path: location, project } as const
    const document = parsed?.document ?? new YAML.Document(project)
    if (parsed) document.set("context", project.context)
    const content = Buffer.from(document.toString({ lineWidth: 0 }))
    if (content.length > MAX_BYTES) invalid("contexto generado demasiado grande")
    const temporaryRelative = `.agents/.project-${randomUUID()}.tmp`
    const temporary = path.join(root, temporaryRelative)
    try {
      throwIfAborted(options.signal)
      await safePath(root, temporaryRelative)
      await atomicWriteFile(root, temporary, content, 0o600)
      const current = await readSafe(root, PROJECT_PATH)
      if (current?.toString("base64") !== before?.toString("base64")) throw new AppError("INSTALL_CONFLICT", "project.yaml cambió durante la inicialización; vuelve a inspeccionarlo", 3)
      await safePath(root, PROJECT_PATH)
      throwIfAborted(options.signal)
      if (before === null) await link(temporary, location)
      else await rename(temporary, location)
      return { action, path: location, project } as const
    } finally {
      await safePath(root, temporaryRelative)
      await rm(temporary, { force: true })
    }
  }
  if (options.dryRun) return apply()
  // El lock existente llama «install» a esta mutación local del kit.
  await safePath(root, ".ms-agent-kit/operation.lock")
  const lock = await acquireOperationLock({ projectRoot: root, homeDir: root, assetsRoot: root, scope: "project" }, "install", options.signal)
  try { return await apply() } finally { await lock.release() }
}
