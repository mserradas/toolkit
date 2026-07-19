import { lstat, readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { parseMarkdown } from "./frontmatter.js"
import { assertPathWithin } from "./security.js"

const STATUSES = ["in_progress", "blocked"] as const

export type WorkflowState = (typeof STATUSES)[number]

export interface WorkflowStatus {
  schema: "ms-progress" | null
  structured: boolean
  confidence: "high" | "low"
  file: string
  slug: string | null
  status: WorkflowState | null
  objective: string | null
  nextAction: string | null
  completed: string[]
  pending: string[]
  files: string[]
  risks: string[]
  updatedAt: string | null
  warnings: string[]
}

export interface WorkflowNext {
  schema: "ms-workflow-next/v3"
  file: string
  ready: boolean
  action: string | null
  reason: string
  status: WorkflowStatus
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const items = value.map(stringValue)
  return items.every((item): item is string => item !== null) ? items : null
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
    if (info.isSymbolicLink()) throw new Error(`Se rechaza un ledger que es un symlink: ${filePath}`)
    return info.isFile()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

async function resolveProgressFile(projectRoot: string, requested?: string): Promise<string> {
  const statusRoot = path.join(projectRoot, ".atl", "status")
  const available = await progressFiles(statusRoot)
  if (!requested) {
    if (available.length === 1) return available[0]!
    if (available.length === 0) throw new Error("No se encontró ningún ledger en `.atl/status`")
    throw new Error(`Hay varios checkpoints; indica uno: ${available.map((file) => path.basename(file)).join(", ")}`)
  }

  if (requested.includes("/") || requested.includes("\\") || requested.endsWith(".md")) {
    const candidate = path.resolve(projectRoot, requested)
    assertPathWithin(statusRoot, candidate)
    if (!(await regularFile(candidate))) throw new Error(`No se encontró el ledger ${requested}`)
    return candidate
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(requested)) {
    throw new Error(`Slug no válido: ${requested}`)
  }
  const exact = path.join(statusRoot, `${requested}-progress.md`)
  if (await regularFile(exact)) return exact
  const matches = available.filter((file) => path.basename(file).includes(requested))
  if (matches.length === 1) return matches[0]!
  if (matches.length > 1) throw new Error(`Slug ambiguo ${requested}: ${matches.map((file) => path.basename(file)).join(", ")}`)
  throw new Error(`No se encontró \`.atl/status/${requested}-progress.md\``)
}

export async function readWorkflowStatus(
  projectRootInput: string,
  requested?: string,
): Promise<WorkflowStatus> {
  const projectRoot = path.resolve(projectRootInput)
  const file = await resolveProgressFile(projectRoot, requested)
  const frontmatter = parseMarkdown(await readFile(file, "utf8")).frontmatter
  const warnings: string[] = []
  const schema = frontmatter.schema === "ms-progress" ? "ms-progress" : null
  const slug = stringValue(frontmatter.slug)
  const status = typeof frontmatter.status === "string" && STATUSES.includes(frontmatter.status as WorkflowState)
    ? frontmatter.status as WorkflowState
    : null
  const objective = stringValue(frontmatter.objective)
  const nextAction = stringValue(frontmatter.next_action)
  const completed = stringList(frontmatter.completed)
  const pending = stringList(frontmatter.pending)
  const files = stringList(frontmatter.files)
  const risks = stringList(frontmatter.risks)
  const updatedAt = stringValue(frontmatter.updated_at)

  if (!schema) warnings.push("El ledger debe usar `schema: ms-progress`")
  if (!slug) warnings.push("Falta `slug`")
  if (!status) warnings.push("`status` debe ser `in_progress` o `blocked`")
  if (!objective) warnings.push("Falta `objective`")
  if (!nextAction) warnings.push("Falta `next_action`")
  if (!completed) warnings.push("`completed` debe ser una lista")
  if (!pending) warnings.push("`pending` debe ser una lista")
  if (!files) warnings.push("`files` debe ser una lista")
  if (!risks) warnings.push("`risks` debe ser una lista")
  if (!updatedAt) warnings.push("Falta `updated_at`")
  if (slug && path.basename(file) !== `${slug}-progress.md`) warnings.push("El slug no coincide con el archivo")

  return {
    schema,
    structured: warnings.length === 0,
    confidence: warnings.length === 0 ? "high" : "low",
    file: path.relative(projectRoot, file).replaceAll("\\", "/"),
    slug,
    status,
    objective,
    nextAction,
    completed: completed ?? [],
    pending: pending ?? [],
    files: files ?? [],
    risks: risks ?? [],
    updatedAt,
    warnings,
  }
}

export function nextWorkflowAction(status: WorkflowStatus): WorkflowNext {
  const ready = status.structured && status.status === "in_progress"
  return {
    schema: "ms-workflow-next/v3",
    file: status.file,
    ready,
    action: ready ? status.nextAction : null,
    reason: ready
      ? "Checkpoint listo para continuar en una sesión nueva"
      : status.status === "blocked"
        ? "El checkpoint está bloqueado; resuelve sus riesgos antes de continuar"
        : "El checkpoint temporal es incompleto o incompatible",
    status,
  }
}
