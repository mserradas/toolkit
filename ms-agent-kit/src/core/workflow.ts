import { lstat, readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { parseMarkdown } from "./frontmatter.js"
import { assertPathWithin } from "./security.js"

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

export type WorkflowPhase = (typeof PHASES)[number]
export type WorkflowState = (typeof STATUSES)[number]
export type WorkflowAction = (typeof NEXT_ACTIONS)[number]

export interface WorkflowArtifacts {
  prd: string | null
  spec: string | null
  tdd: string | null
}

export interface WorkflowStatus {
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
  artifacts: WorkflowArtifacts
  updatedAt: string | null
  warnings: string[]
}

export interface WorkflowNext {
  schema: "ms-workflow-next/v1"
  file: string
  ready: boolean
  action: WorkflowAction | null
  activePackage: string | null
  reason: string
  status: WorkflowStatus
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

export async function readWorkflowStatus(
  projectRootInput: string,
  requested?: string,
): Promise<WorkflowStatus> {
  const projectRoot = path.resolve(projectRootInput)
  const filePath = await resolveProgressFile(projectRoot, requested)
  const parsed = parseMarkdown(await readFile(filePath, "utf8"))
  const frontmatter = parsed.frontmatter
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
  if (status === "blocked" && blocked !== true) {
    warnings.push("status=blocked exige blocked=true")
  }
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

export function nextWorkflowAction(status: WorkflowStatus): WorkflowNext {
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
    schema: "ms-workflow-next/v1",
    file: status.file,
    ready,
    action: status.nextAction,
    activePackage: status.activePackage,
    reason,
    status,
  }
}
