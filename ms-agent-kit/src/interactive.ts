import path from "node:path"
import { styleText } from "node:util"
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
  type InstallResult,
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

type AppliedResult = "created" | "updated" | "adopted" | "removed" | "restored" | "detached"

const appliedResultLabels: Array<[AppliedResult, string, PlanAction | ObsoleteAction]> = [
  ["created", "+ Creados", "create"],
  ["updated", "↻ Actualizados", "update"],
  ["adopted", "◇ Adoptados", "adopt"],
  ["removed", "− Obsoletos eliminados", "remove"],
  ["restored", "↩ Restaurados", "restore"],
  ["detached", "↪ Desvinculados", "detach"],
]

const ui = {
  heading: (value: string): string => styleText("bold", value),
  success: (value: string): string => styleText("green", value),
  info: (value: string): string => styleText("cyan", value),
  warning: (value: string): string => styleText("yellow", value),
  danger: (value: string): string => styleText("red", value),
  path: (value: string): string => styleText(["cyan", "dim"], value),
}

function styleChange(action: PlanAction | ObsoleteAction, value: string): string {
  switch (action) {
    case "create":
    case "adopt":
    case "restore":
      return ui.success(value)
    case "update":
    case "detach":
      return ui.info(value)
    case "remove":
    case "skip":
      return ui.warning(value)
    case "conflict":
      return ui.danger(value)
    case "unchanged":
      return ui.success(value)
  }
}

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
    .map(([action, label]) => `  ${styleChange(action, `${label} · ${summary.counts[action]}`)}`)
  const scope =
    summary.scope === "user"
      ? [`  ${ui.info("Usuario (global)")}`]
      : [`  ${ui.info("Proyecto")}`, `  ${ui.path(displayPath(summary.projectRoot, summary.homeDir))}`]
  const body = [
    ui.heading("Clientes"),
    ...summary.targets.map((target) => `  ${ui.success(`✓ ${targetLabels[target]}`)}`),
    "",
    ui.heading("Destino"),
    ...scope,
  ]

  if (!planNeedsConfirmation(summary.counts)) {
    const files = summary.counts.unchanged === 1 ? "1 archivo sin cambios" : `${summary.counts.unchanged} archivos sin cambios`
    body.push("", ui.heading("Estado"), `  ${ui.success("✓ Todo está actualizado")}`, `  ${files}`)
  } else {
    body.push("", ui.heading("Cambios que se aplicarán"))
    body.push(...(changes.length > 0 ? changes : ["  · Ninguno hasta resolver los conflictos"]))
    if (summary.counts.conflict === 0) body.push(`  ${ui.success("✓ Sin conflictos")}`)
  }

  if (summary.counts.conflict > 0) {
    body.push(
      "",
      ui.heading("Conflictos"),
      `  ${styleChange("conflict", `! Requieren atención · ${summary.counts.conflict}`)}`,
    )
  }

  body.push("", ui.heading("Registro"), `  ${ui.path(displayPath(summary.statePath, summary.homeDir))}`)
  return body.join("\n")
}

export function showInstallSummary(
  summary: InteractivePlanSummary,
  driver: InteractiveDriver = clackDriver,
): void {
  driver.note(formatInstallSummary(summary), ui.info("Resumen de instalación"))
}

export function finishWithoutChanges(driver: InteractiveDriver = clackDriver): void {
  driver.outro("No hay cambios que aplicar")
}

export function formatInstallResult(result: InstallResult, homeDir: string): string {
  const applied = appliedResultLabels
    .filter(([key]) => result[key] > 0)
    .map(([key, label, action]) => `  ${styleChange(action, `${label} · ${result[key]}`)}`)
  const body = [ui.heading("Cambios aplicados"), ...applied]

  if (result.unchanged > 0) {
    body.push("", ui.heading("Conservados"), `  ${ui.success(`✓ Sin cambios · ${result.unchanged}`)}`)
  }

  if (result.skipped > 0) {
    body.push("", ui.heading("Requieren revisión"), `  ${ui.warning(`! Omitidos · ${result.skipped}`)}`)
  }

  body.push("", ui.heading("Registro"), `  ${ui.path(displayPath(result.statePath, homeDir))}`)
  return body.join("\n")
}

export function showInstallResult(
  result: InstallResult,
  homeDir: string,
  driver: InteractiveDriver = clackDriver,
): void {
  driver.note(formatInstallResult(result, homeDir), ui.success("Instalación completada"))
  driver.outro(ui.success("Configuración lista"))
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
