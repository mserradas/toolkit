/** Expone operaciones deterministas del workflow sin depender de un ejecutable externo. */

import { tool, type Plugin } from "@opencode-ai/plugin"
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { lstat, readFile, readdir } from "node:fs/promises"
import { devNull } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import YAML from "yaml"

const execFileAsync = promisify(execFile)
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
const PHASES = [
  "spec",
  "tdd",
  "implementation",
  "verification",
  "review",
  "documentation",
  "closure",
] as const
const STATUSES = ["pending", "in_progress", "blocked", "verified", "closed"] as const
const NEXT_ACTIONS = [
  "create_spec",
  "create_tdd",
  "implement_package",
  "verify",
  "review",
  "document",
  "archive_spec",
  "close",
  "ask_user",
  "stop",
] as const

type WorkflowPhase = (typeof PHASES)[number]
type WorkflowState = (typeof STATUSES)[number]
type WorkflowAction = (typeof NEXT_ACTIONS)[number]

type WorkflowStatus = {
  schema: "ms-progress/v1" | null
  structured: boolean
  confidence: "high" | "low"
  file: string
  slug: string | null
  phase: WorkflowPhase | null
  level: 3 | 4 | null
  status: WorkflowState | null
  activePackage: string | null
  nextAction: WorkflowAction | null
  blocked: boolean | null
  artifacts: { prd: string | null; spec: string | null; tdd: string | null }
  updatedAt: string | null
  warnings: string[]
}

type ReviewFingerprint = {
  schema: "ms-review-fingerprint/v1"
  scope: "worktree" | "staged"
  fingerprint: string
  baseCommit: string
  files: string[]
  fileCount: number
  untrackedFiles: number
  additions: number
  deletions: number
}

function assertPathWithin(root: string, destination: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(destination))
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return
  throw new Error(`Ruta fuera del root permitido: ${destination}`)
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function nullablePath(value: unknown): string | null {
  return value === null ? null : stringValue(value)
}

function enumValue<T extends readonly string[]>(values: T, value: unknown): T[number] | null {
  return typeof value === "string" && values.includes(value as T[number])
    ? (value as T[number])
    : null
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

async function progressFiles(statusRoot: string): Promise<string[]> {
  try {
    return (await readdir(statusRoot, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith("-progress.md"))
      .map((entry) => path.join(statusRoot, entry.name))
      .sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
}

async function regularFile(filePath: string): Promise<boolean> {
  try {
    const info = await lstat(filePath)
    if (info.isSymbolicLink()) throw new Error(`Se rechaza un ledger symlink: ${filePath}`)
    return info.isFile()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

async function resolveProgressFile(projectRoot: string, requested?: string): Promise<string> {
  const statusRoot = path.join(projectRoot, "docs", "status")
  const available = await progressFiles(statusRoot)

  if (!requested) {
    if (available.length === 1) return available[0]!
    if (available.length === 0) throw new Error("No se encontro ningun ledger en docs/status")
    throw new Error(
      `Hay varios workflows; indica un slug o ruta: ${available.map((file) => path.basename(file)).join(", ")}`,
    )
  }

  const looksLikePath = requested.includes("/") || requested.includes("\\") || requested.endsWith(".md")
  if (looksLikePath) {
    const candidate = path.resolve(projectRoot, requested)
    assertPathWithin(statusRoot, candidate)
    if (!(await regularFile(candidate))) throw new Error(`No se encontro el ledger ${requested}`)
    return candidate
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(requested)) {
    throw new Error(`Slug de workflow invalido: ${requested}`)
  }
  const exact = path.join(statusRoot, `${requested}-progress.md`)
  if (await regularFile(exact)) return exact

  const matches = available.filter((file) => path.basename(file).includes(requested))
  if (matches.length === 1) return matches[0]!
  if (matches.length > 1) {
    throw new Error(`Slug ambiguo ${requested}: ${matches.map((file) => path.basename(file)).join(", ")}`)
  }
  throw new Error(`No se encontro docs/status/${requested}-progress.md`)
}

async function readWorkflowStatus(
  projectRootInput: string,
  requested?: string,
): Promise<WorkflowStatus> {
  const projectRoot = path.resolve(projectRootInput)
  const filePath = await resolveProgressFile(projectRoot, requested)
  const input = await readFile(filePath, "utf8")
  const match = FRONTMATTER.exec(input)
  const parsed = match ? YAML.parse(match[1] ?? "") : {}
  if (parsed !== null && (typeof parsed !== "object" || Array.isArray(parsed))) {
    throw new Error("El frontmatter debe ser un objeto YAML")
  }
  const frontmatter = (parsed ?? {}) as Record<string, unknown>
  const warnings: string[] = []
  const schema = frontmatter.schema === "ms-progress/v1" ? "ms-progress/v1" : null

  if (!schema) warnings.push("Ledger legacy: falta schema ms-progress/v1")
  const slug = stringValue(frontmatter.slug)
  const phase = enumValue(PHASES, frontmatter.phase)
  const level = frontmatter.level === 3 || frontmatter.level === 4 ? frontmatter.level : null
  const status = enumValue(STATUSES, frontmatter.status)
  const activePackage = frontmatter.active_package === null ? null : stringValue(frontmatter.active_package)
  const nextAction = enumValue(NEXT_ACTIONS, frontmatter.next_action)
  const blocked = typeof frontmatter.blocked === "boolean" ? frontmatter.blocked : null
  const artifactValues =
    typeof frontmatter.artifacts === "object" && frontmatter.artifacts !== null
      ? (frontmatter.artifacts as Record<string, unknown>)
      : {}
  const artifacts = {
    prd: nullablePath(artifactValues.prd),
    spec: nullablePath(artifactValues.spec),
    tdd: nullablePath(artifactValues.tdd),
  }
  const updatedAt = stringValue(frontmatter.updated_at)

  const required = { slug, phase, level, status, nextAction, blocked, updatedAt }
  for (const [key, value] of Object.entries(required)) {
    if (value === null) warnings.push(`Campo requerido invalido o ausente: ${key}`)
  }
  const expectedSlug = path.basename(filePath, "-progress.md")
  if (slug && slug !== expectedSlug) {
    warnings.push(`El slug ${slug} no coincide con el archivo ${expectedSlug}-progress.md`)
  }
  if (
    !hasOwn(frontmatter, "active_package") ||
    (frontmatter.active_package !== null && stringValue(frontmatter.active_package) === null)
  ) {
    warnings.push("Campo requerido invalido o ausente: active_package")
  }
  if (!hasOwn(frontmatter, "artifacts") || typeof frontmatter.artifacts !== "object" || frontmatter.artifacts === null) {
    warnings.push("Campo requerido invalido o ausente: artifacts")
  } else {
    for (const artifact of ["prd", "spec", "tdd"]) {
      const value = artifactValues[artifact]
      if (!hasOwn(artifactValues, artifact) || (value !== null && stringValue(value) === null)) {
        warnings.push(`Campo requerido invalido o ausente: artifacts.${artifact}`)
      }
    }
  }
  if (blocked === true && (status !== "blocked" || !["ask_user", "stop"].includes(nextAction ?? ""))) {
    warnings.push("blocked=true exige status=blocked y next_action ask_user|stop")
  }
  if (status === "blocked" && blocked !== true) warnings.push("status=blocked exige blocked=true")
  if (status === "closed" && (phase !== "closure" || nextAction !== "stop" || activePackage !== null)) {
    warnings.push("status=closed exige phase=closure, next_action=stop y active_package=null")
  }
  if (nextAction === "implement_package" && !activePackage) {
    warnings.push("next_action=implement_package exige active_package")
  }

  const structured = schema === "ms-progress/v1" && warnings.length === 0
  return {
    schema,
    structured,
    confidence: structured ? "high" : "low",
    file: path.relative(projectRoot, filePath).replaceAll("\\", "/"),
    slug,
    phase,
    level,
    status,
    activePackage,
    nextAction,
    blocked,
    artifacts,
    updatedAt,
    warnings,
  }
}

function nextWorkflowAction(status: WorkflowStatus) {
  let ready = false
  let reason = "Estado estructurado listo"

  if (!status.structured) {
    reason = "El ledger debe migrarse a ms-progress/v1 antes de continuar"
  } else if (status.blocked || status.status === "blocked") {
    reason = "El workflow esta bloqueado; resuelve el bloqueo antes de avanzar"
  } else if (status.status === "closed" || status.nextAction === "stop") {
    reason = "El workflow esta cerrado o no tiene una accion ejecutable"
  } else if (status.nextAction === "ask_user") {
    reason = "La siguiente accion requiere una decision del usuario"
  } else {
    ready = true
  }

  return {
    schema: "ms-workflow-next/v1" as const,
    file: status.file,
    ready,
    action: status.nextAction,
    activePackage: status.activePackage,
    reason,
    status,
  }
}

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    })
    return stdout
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim()
    throw new Error(stderr || `git ${args.join(" ")} fallo`)
  }
}

async function gitDiffNoIndex(cwd: string, filePath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--no-index", "--numstat", "--", devNull, filePath],
      { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    )
    return stdout
  } catch (error) {
    const result = error as { code?: number; stdout?: string; stderr?: string }
    if (result.code === 1) return result.stdout ?? ""
    throw new Error(result.stderr?.trim() || `git diff --no-index fallo para ${filePath}`)
  }
}

function parseNumstat(value: string): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const line of value.split("\n")) {
    if (!line) continue
    const [added, deleted] = line.split("\t")
    if (added && added !== "-") additions += Number.parseInt(added, 10) || 0
    if (deleted && deleted !== "-") deletions += Number.parseInt(deleted, 10) || 0
  }
  return { additions, deletions }
}

function changedPaths(value: string): { files: string[]; allPaths: string[] } {
  const fields = value.split("\0").filter(Boolean)
  const files: string[] = []
  const allPaths: string[] = []
  for (let index = 0; index < fields.length; ) {
    const status = fields[index++]!
    const source = fields[index++]
    if (!source) throw new Error("Git devolvio un name-status incompleto")
    allPaths.push(source)
    if (status.startsWith("R") || status.startsWith("C")) {
      const destination = fields[index++]
      if (!destination) throw new Error("Git devolvio un rename/copy incompleto")
      allPaths.push(destination)
      files.push(destination)
    } else {
      files.push(source)
    }
  }
  return { files: files.sort(), allPaths }
}

function isSensitivePath(input: string): boolean {
  const normalized = input.replaceAll("\\", "/").replace(/^\.\//, "")
  const segments = normalized.split("/").filter(Boolean)
  const basename = segments.at(-1) ?? ""
  const safeEnvironmentTemplates = new Set([".env.example", ".env.sample", ".env.template"])

  if (basename === ".env" || (basename.startsWith(".env.") && !safeEnvironmentTemplates.has(basename))) {
    return true
  }
  if (segments.some((segment) => ["secrets", ".ssh", ".credentials"].includes(segment))) return true
  if (/\.(?:key|pem|p12|pfx)$/.test(basename)) return true
  return [
    ".aws/credentials",
    ".config/gh/hosts.yml",
    ".docker/config.json",
    ".kube/config",
    ".netrc",
    ".npmrc",
    ".pypirc",
    "credentials.json",
  ].some((candidate) => normalized === candidate || normalized.endsWith(`/${candidate}`))
}

async function baseCommit(gitRoot: string): Promise<string> {
  try {
    return (await git(gitRoot, ["rev-parse", "--verify", "HEAD"])).trim()
  } catch {
    return "UNBORN"
  }
}

async function untrackedSnapshot(gitRoot: string, files: string[]) {
  const snapshots = await Promise.all(
    files.map(async (file) => {
      const absolutePath = path.resolve(gitRoot, file)
      assertPathWithin(gitRoot, absolutePath)
      const info = await lstat(absolutePath)
      if (info.isSymbolicLink() || !info.isFile()) {
        throw new Error(`El candidato worktree contiene una ruta no regular: ${file}`)
      }
      const [blobHash, numstat] = await Promise.all([
        git(gitRoot, ["hash-object", "--no-filters", "--", file]),
        gitDiffNoIndex(gitRoot, absolutePath),
      ])
      return {
        identity: `${file}\0${info.mode & 0o777}\0${blobHash.trim()}`,
        stats: parseNumstat(numstat),
      }
    }),
  )
  return {
    hashes: snapshots.map((snapshot) => snapshot.identity).sort(),
    additions: snapshots.reduce((total, snapshot) => total + snapshot.stats.additions, 0),
    deletions: snapshots.reduce((total, snapshot) => total + snapshot.stats.deletions, 0),
  }
}

async function fingerprintWorktreeReview(projectRootInput: string): Promise<ReviewFingerprint> {
  const projectRoot = path.resolve(projectRootInput)
  const gitRoot = (await git(projectRoot, ["rev-parse", "--show-toplevel"])).trim()
  const commit = await baseCommit(gitRoot)
  const trackedRequests = commit === "UNBORN"
    ? [
        ["diff", "--cached", "--name-status", "-z", "--find-renames", "--find-copies"],
        ["diff", "--name-status", "-z", "--find-renames", "--find-copies"],
      ]
    : [["diff", "HEAD", "--name-status", "-z", "--find-renames", "--find-copies"]]
  const trackedDiffRequests = commit === "UNBORN"
    ? [
        ["diff", "--cached", "--binary", "--full-index", "--no-ext-diff", "--"],
        ["diff", "--binary", "--full-index", "--no-ext-diff", "--"],
      ]
    : [["diff", "HEAD", "--binary", "--full-index", "--no-ext-diff", "--"]]
  const trackedStatRequests = commit === "UNBORN"
    ? [
        ["diff", "--cached", "--numstat", "--no-ext-diff", "--"],
        ["diff", "--numstat", "--no-ext-diff", "--"],
      ]
    : [["diff", "HEAD", "--numstat", "--no-ext-diff", "--"]]
  const [trackedOutputs, untrackedOutput] = await Promise.all([
    Promise.all(trackedRequests.map((args) => git(gitRoot, args))),
    git(gitRoot, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ])
  const trackedParts = trackedOutputs.map(changedPaths)
  const tracked = {
    files: [...new Set(trackedParts.flatMap((part) => part.files))].sort(),
    allPaths: [...new Set(trackedParts.flatMap((part) => part.allPaths))],
  }
  const untracked = untrackedOutput.split("\0").filter(Boolean).sort()
  const allPaths = [...tracked.allPaths, ...untracked]
  if (allPaths.length === 0) throw new Error("No hay cambios en el worktree para calcular una huella")
  if (allPaths.some(isSensitivePath)) {
    throw new Error("El candidato worktree contiene una ruta sensible; no se calcula la huella")
  }

  const [diffParts, trackedNumstatParts, untrackedData] = await Promise.all([
    Promise.all(trackedDiffRequests.map((args) => git(gitRoot, args))),
    Promise.all(trackedStatRequests.map((args) => git(gitRoot, args))),
    untrackedSnapshot(gitRoot, untracked),
  ])
  const trackedStats = parseNumstat(trackedNumstatParts.join("\n"))
  const files = [...new Set([...tracked.files, ...untracked])].sort()
  const fingerprint = createHash("sha256")
    .update([
      "ms-review-fingerprint/v1",
      "worktree",
      commit,
      files.join("\n"),
      diffParts.join("\0WORKTREE_LAYER\0"),
      untrackedData.hashes.join("\n"),
    ].join("\0"))
    .digest("hex")

  return {
    schema: "ms-review-fingerprint/v1",
    scope: "worktree",
    fingerprint: `sha256:${fingerprint}`,
    baseCommit: commit,
    files,
    fileCount: files.length,
    untrackedFiles: untracked.length,
    additions: trackedStats.additions + untrackedData.additions,
    deletions: trackedStats.deletions + untrackedData.deletions,
  }
}

async function fingerprintStagedReview(projectRootInput: string): Promise<ReviewFingerprint> {
  const projectRoot = path.resolve(projectRootInput)
  const gitRoot = (await git(projectRoot, ["rev-parse", "--show-toplevel"])).trim()
  const fileOutput = await git(gitRoot, [
    "diff",
    "--cached",
    "--name-status",
    "-z",
    "--find-renames",
    "--find-copies",
    "--diff-filter=ACDMRTUXB",
  ])
  const { files, allPaths } = changedPaths(fileOutput)
  if (files.length === 0) throw new Error("No hay cambios staged para calcular una huella")
  if (allPaths.some(isSensitivePath)) {
    throw new Error("El candidato staged contiene una ruta sensible; no se calcula la huella")
  }

  const commit = await baseCommit(gitRoot)
  const [diff, numstat] = await Promise.all([
    git(gitRoot, ["diff", "--cached", "--binary", "--full-index", "--no-ext-diff", "--"]),
    git(gitRoot, ["diff", "--cached", "--numstat", "--no-ext-diff", "--"]),
  ])
  const stats = parseNumstat(numstat)
  const fingerprint = createHash("sha256")
    .update(["ms-review-fingerprint/v1", "staged", commit, files.join("\n"), diff].join("\0"))
    .digest("hex")

  return {
    schema: "ms-review-fingerprint/v1",
    scope: "staged",
    fingerprint: `sha256:${fingerprint}`,
    baseCommit: commit,
    files,
    fileCount: files.length,
    untrackedFiles: 0,
    ...stats,
  }
}

async function fingerprintReview(
  projectRoot: string,
  scope: "worktree" | "staged" = "worktree",
): Promise<ReviewFingerprint> {
  return scope === "staged"
    ? fingerprintStagedReview(projectRoot)
    : fingerprintWorktreeReview(projectRoot)
}

const workflowToolsPlugin: Plugin = async (input) => {
  const projectRoot = input.worktree || input.directory
  return {
    tool: {
      ms_workflow_status: tool({
        description: "Lee y valida el ledger ms-progress/v1 del proyecto.",
        args: {
          requested: tool.schema
            .string()
            .optional()
            .describe("Slug o ruta relativa del ledger; se puede omitir si solo existe uno."),
        },
        async execute(args) {
          const result = await readWorkflowStatus(projectRoot, args.requested)
          return {
            title: result.structured ? "Estado del workflow" : "Estado del workflow con avisos",
            output: JSON.stringify(result, null, 2),
            metadata: result,
          }
        },
      }),
      ms_workflow_next: tool({
        description: "Resuelve la siguiente accion autorizada desde un ledger ms-progress/v1.",
        args: {
          requested: tool.schema
            .string()
            .optional()
            .describe("Slug o ruta relativa del ledger; se puede omitir si solo existe uno."),
        },
        async execute(args) {
          const result = nextWorkflowAction(await readWorkflowStatus(projectRoot, args.requested))
          return {
            title: result.ready ? "Siguiente accion lista" : "Workflow no ejecutable",
            output: JSON.stringify(result, null, 2),
            metadata: result,
          }
        },
      }),
      ms_review_fingerprint: tool({
        description: "Calcula una huella determinista del candidato de revision sin leer secretos.",
        args: {
          scope: tool.schema
            .enum(["worktree", "staged"])
            .optional()
            .default("worktree")
            .describe("Usa staged solo cuando ese sea el candidato explicito."),
        },
        async execute(args) {
          const result = await fingerprintReview(projectRoot, args.scope)
          return {
            title: "Huella del candidato de revision",
            output: JSON.stringify(result, null, 2),
            metadata: result,
          }
        },
      }),
    },
  }
}

const MsWorkflowToolsPlugin = Object.assign(workflowToolsPlugin, {
  __test: { readWorkflowStatus, nextWorkflowAction, fingerprintReview },
})

export default MsWorkflowToolsPlugin
