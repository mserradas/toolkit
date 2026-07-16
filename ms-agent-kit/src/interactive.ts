import path from "node:path"
import {
  cancel,
  confirm,
  intro,
  isCancel,
  multiselect,
  note,
  outro,
  select,
  text,
  type ConfirmOptions,
  type MultiSelectOptions,
  type SelectOptions,
  type TextOptions,
} from "@clack/prompts"
import {
  TARGETS,
  type InstallScope,
  type ObsoleteAction,
  type PlanAction,
  type Target,
} from "./core/types.js"

export type PlanSummaryCounts = Record<PlanAction | ObsoleteAction, number>

export interface InteractivePlanSummary {
  targets: Target[]
  scope: InstallScope
  homeDir: string
  projectRoot: string
  statePath: string
  counts: PlanSummaryCounts
}

export interface InteractiveDriver {
  intro(message: string): void
  cancel(message: string): void
  note(message?: string, title?: string): void
  outro(message: string): void
  isCancel(value: unknown): value is symbol
  multiselect(options: MultiSelectOptions<Target>): Promise<Target[] | symbol>
  select(options: SelectOptions<InstallScope>): Promise<InstallScope | symbol>
  text(options: TextOptions): Promise<string | symbol>
  confirm(options: ConfirmOptions): Promise<boolean | symbol>
}

export interface InteractiveInstallOptions {
  targets: Target[]
  scope: InstallScope
  projectRoot: string
}

const clackDriver: InteractiveDriver = {
  intro,
  cancel,
  note,
  outro,
  isCancel,
  multiselect,
  select,
  text,
  confirm,
}

const targetLabels: Record<Target, string> = {
  opencode: "OpenCode",
  claude: "Claude Code",
  codex: "Codex",
}

const changeLabels: Array<[Exclude<PlanAction | ObsoleteAction, "unchanged" | "conflict">, string]> = [
  ["create", "+ Crear"],
  ["update", "↻ Actualizar"],
  ["adopt", "◇ Adoptar"],
  ["remove", "− Eliminar"],
  ["restore", "↩ Restaurar"],
  ["detach", "↪ Desvincular"],
  ["skip", "· Omitir"],
]

function displayPath(value: string, homeDir: string): string {
  const relative = path.relative(path.resolve(homeDir), path.resolve(value))
  if (relative === "") return "~"
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return path.join("~", relative)
  }
  return value
}

export function planNeedsConfirmation(counts: PlanSummaryCounts): boolean {
  return changeLabels.some(([action]) => counts[action] > 0) || counts.conflict > 0
}

export function plannedChangeCount(counts: PlanSummaryCounts): number {
  return counts.create + counts.update + counts.adopt + counts.remove + counts.restore + counts.detach
}

export function formatInstallSummary(summary: InteractivePlanSummary): string {
  const changes = changeLabels
    .filter(([action]) => summary.counts[action] > 0)
    .map(([action, label]) => `  ${label} · ${summary.counts[action]}`)
  const scope =
    summary.scope === "user"
      ? ["  Usuario (global)"]
      : ["  Proyecto", `  ${displayPath(summary.projectRoot, summary.homeDir)}`]
  const body = [
    "Clientes",
    ...summary.targets.map((target) => `  ✓ ${targetLabels[target]}`),
    "",
    "Destino",
    ...scope,
  ]

  if (!planNeedsConfirmation(summary.counts)) {
    const files = summary.counts.unchanged === 1 ? "1 archivo sin cambios" : `${summary.counts.unchanged} archivos sin cambios`
    body.push("", "Estado", "  ✓ Todo está actualizado", `  ${files}`)
  } else {
    body.push("", "Cambios que se aplicarán")
    body.push(...(changes.length > 0 ? changes : ["  · Ninguno hasta resolver los conflictos"]))
    if (summary.counts.conflict === 0) body.push("  ✓ Sin conflictos")
  }

  if (summary.counts.conflict > 0) {
    body.push("", "Conflictos", `  ! Requieren atención · ${summary.counts.conflict}`)
  }

  body.push("", "Registro", `  ${displayPath(summary.statePath, summary.homeDir)}`)
  return body.join("\n")
}

export function showInstallSummary(
  summary: InteractivePlanSummary,
  driver: InteractiveDriver = clackDriver,
): void {
  driver.note(formatInstallSummary(summary), "Resumen de instalación")
}

export function finishWithoutChanges(driver: InteractiveDriver = clackDriver): void {
  driver.outro("No hay cambios que aplicar")
}

function stop(message: string, driver: InteractiveDriver): null {
  driver.cancel(message)
  return null
}

export async function promptInstallOptions(
  cwd: string,
  driver: InteractiveDriver = clackDriver,
): Promise<InteractiveInstallOptions | null> {
  driver.intro("ms-agent-kit · instalación interactiva")
  const targets = await driver.multiselect({
    message: "¿Qué clientes quieres configurar?",
    options: [
      { label: "OpenCode", value: "opencode" },
      { label: "Claude Code", value: "claude" },
      { label: "Codex", value: "codex" },
    ],
    initialValues: [...TARGETS],
    required: true,
  })
  if (driver.isCancel(targets)) return stop("Instalación cancelada", driver)

  const scope = await driver.select({
    message: "¿Dónde quieres instalar la configuración?",
    options: [
      { label: "Usuario (global)", value: "user" },
      { label: "Proyecto", value: "project" },
    ],
    initialValue: "user",
  })
  if (driver.isCancel(scope)) return stop("Instalación cancelada", driver)

  let projectRoot = path.resolve(cwd)
  if (scope === "project") {
    const selectedPath = await driver.text({
      message: "Ruta del proyecto",
      initialValue: cwd,
      defaultValue: cwd,
    })
    if (driver.isCancel(selectedPath)) return stop("Instalación cancelada", driver)
    projectRoot = path.resolve(cwd, selectedPath)
  }

  return { targets, scope, projectRoot }
}

export async function promptConfirmation(
  message: string,
  driver: InteractiveDriver = clackDriver,
): Promise<boolean | null> {
  const answer = await driver.confirm({
    message,
    active: "Sí",
    inactive: "No",
    initialValue: false,
  })
  return driver.isCancel(answer) ? stop("Operación cancelada", driver) : answer
}
