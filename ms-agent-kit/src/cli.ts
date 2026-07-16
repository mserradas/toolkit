#!/usr/bin/env node

import { execFile } from "node:child_process"
import { readdir, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import process from "node:process"
import { parseArgs, promisify } from "node:util"
import { buildArtifacts } from "./adapters/index.js"
import { DEFAULT_ASSETS_ROOT, loadCatalog } from "./core/catalog.js"
import { parseMarkdown } from "./core/frontmatter.js"
import { applyPlan, installationStatus, uninstallTargets } from "./core/installer.js"
import { createPlan } from "./core/planner.js"
import { fingerprintReview } from "./core/review.js"
import { ensureAtlIgnored, refreshSkillRegistry } from "./core/skill-registry.js"
import { nextWorkflowAction, readWorkflowStatus } from "./core/workflow.js"
import {
  finishWithoutChanges,
  plannedChangeCount,
  planNeedsConfirmation,
  promptConfirmation,
  promptInstallOptions,
  showInstallSummary,
  type PlanSummaryCounts,
} from "./interactive.js"
import {
  TARGETS,
  owningTargets,
  type BuildContext,
  type InstallPlan,
  type InstallScope,
  type Target,
} from "./core/types.js"

const execFileAsync = promisify(execFile)

const HELP = `
ms-agent-kit - instalador portable de agentes ms-*

Uso:
  ms-agent-kit                     Asistente interactivo de instalacion
  ms-agent-kit list
  ms-agent-kit doctor [opciones]
  ms-agent-kit plan [opciones]
  ms-agent-kit install [opciones]
  ms-agent-kit status [opciones]
  ms-agent-kit uninstall [opciones]
  ms-agent-kit workflow status [slug|ruta] [--project <ruta>] [--json]
  ms-agent-kit workflow next [slug|ruta] [--project <ruta>] [--json]
  ms-agent-kit review fingerprint [--scope worktree|staged] [--project <ruta>] [--json]
  ms-agent-kit skill-registry refresh [--project <ruta>] [--home <ruta>] [--force] [--no-gitignore] [--json]

Opciones:
  --target <valor>    opencode, claude, codex o all. Puede repetirse.
  --scope <valor>     user (default) o project.
  --project <ruta>    Root del proyecto para scope project (default: cwd).
  --home <ruta>       Home alternativo, util para pruebas o dotfiles.
  --assets <ruta>     Catalogo de assets alternativo.
  --force             Adopta conflictos durante install, guardando backup.
  --yes               No solicita confirmacion.
  --dry-run           En install, muestra el plan sin escribir.
  --json              Salida JSON.
  --help              Muestra esta ayuda.
`

interface CliOptions {
  targets: Target[]
  context: BuildContext
  force: boolean
  yes: boolean
  dryRun: boolean
  json: boolean
}

interface LocalOptions {
  projectRoot: string
  homeDir: string
  force: boolean
  json: boolean
  scope: string
  noGitignore: boolean
  positionals: string[]
}

function localOptions(args: string[]): LocalOptions {
  const parsed = parseArgs({
    args,
    options: {
      project: { type: "string" },
      home: { type: "string" },
      force: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      scope: { type: "string", default: "worktree" },
      "no-gitignore": { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
  })
  return {
    projectRoot: path.resolve(parsed.values.project ?? process.cwd()),
    homeDir: path.resolve(parsed.values.home ?? homedir()),
    force: parsed.values.force,
    json: parsed.values.json,
    scope: parsed.values.scope,
    noGitignore: parsed.values["no-gitignore"],
    positionals: parsed.positionals,
  }
}

function parseTargets(values: string[] | undefined): Target[] {
  const requested = (values ?? ["all"])
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  if (requested.includes("all")) return [...TARGETS]

  const targets: Target[] = []
  for (const value of requested) {
    if (!TARGETS.includes(value as Target)) {
      throw new Error(`Target invalido: ${value}`)
    }
    if (!targets.includes(value as Target)) targets.push(value as Target)
  }
  if (targets.length === 0) throw new Error("Debes indicar al menos un target")
  return targets
}

function cliOptions(args: string[]): CliOptions {
  const parsed = parseArgs({
    args,
    options: {
      target: { type: "string", multiple: true },
      scope: { type: "string", default: "user" },
      project: { type: "string" },
      home: { type: "string" },
      assets: { type: "string" },
      force: { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
  })

  if (parsed.values.help) {
    process.stdout.write(HELP)
    process.exit(0)
  }

  const scope = parsed.values.scope as InstallScope
  if (scope !== "user" && scope !== "project") {
    throw new Error(`Scope invalido: ${String(parsed.values.scope)}`)
  }

  const homeDir = path.resolve(parsed.values.home ?? homedir())
  const projectRoot = path.resolve(parsed.values.project ?? process.cwd())
  return {
    targets: parseTargets(parsed.values.target),
    context: {
      assetsRoot: path.resolve(parsed.values.assets ?? DEFAULT_ASSETS_ROOT),
      homeDir,
      projectRoot,
      scope,
    },
    force: parsed.values.force,
    yes: parsed.values.yes,
    dryRun: parsed.values["dry-run"],
    json: parsed.values.json,
  }
}

function planSummary(plan: InstallPlan): PlanSummaryCounts {
  const summary: PlanSummaryCounts = {
    create: 0,
    update: 0,
    adopt: 0,
    unchanged: 0,
    conflict: 0,
    remove: 0,
    restore: 0,
    detach: 0,
    skip: 0,
  }
  for (const item of plan.items) summary[item.action] = (summary[item.action] ?? 0) + 1
  for (const item of plan.obsolete) summary[item.action] = (summary[item.action] ?? 0) + 1
  return summary
}

function printInteractivePlan(plan: InstallPlan, options: CliOptions): void {
  showInstallSummary({
    targets: options.targets,
    scope: options.context.scope,
    homeDir: options.context.homeDir,
    projectRoot: options.context.projectRoot,
    statePath: plan.statePath,
    counts: planSummary(plan),
  })
}

function printPlan(plan: InstallPlan, asJson: boolean): void {
  if (asJson) {
    process.stdout.write(
      `${JSON.stringify(
        {
          statePath: plan.statePath,
          summary: planSummary(plan),
          items: [
            ...plan.items.map((item) => ({
              action: item.action,
              targets: owningTargets(item.artifact),
              kind: item.artifact.kind,
              name: item.artifact.name,
              destination: item.artifact.destination,
              reason: item.reason,
            })),
            ...plan.obsolete.map((item) => ({
              action: item.action,
              targets: item.obsoleteTargets,
              kind: item.file.kind,
              name: item.file.name,
              destination: item.file.path,
              reason: item.reason,
            })),
          ],
        },
        null,
        2,
      )}\n`,
    )
    return
  }

  const summary = planSummary(plan)
  process.stdout.write(
    `Plan: ${summary.create} crear, ${summary.update} actualizar, ${summary.adopt} adoptar, ${summary.unchanged} sin cambios, ${summary.remove} eliminar, ${summary.restore} restaurar, ${summary.detach} desvincular, ${summary.skip} omitir, ${summary.conflict} conflictos\n`,
  )
  for (const item of plan.items) {
    if (item.action === "unchanged") continue
    process.stdout.write(
      `[${item.action}] ${owningTargets(item.artifact).join("+")}/${item.artifact.kind} ${item.artifact.name}\n  ${item.artifact.destination}\n  ${item.reason}\n`,
    )
  }
  for (const item of plan.obsolete) {
    process.stdout.write(
      `[${item.action}] ${item.obsoleteTargets.join("+")}/${item.file.kind} ${item.file.name}\n  ${item.file.path}\n  ${item.reason}\n`,
    )
  }
  process.stdout.write(`Estado: ${plan.statePath}\n`)
}

async function confirm(question: string, yes: boolean): Promise<boolean | null> {
  if (yes) return true
  if (!process.stdin.isTTY) {
    throw new Error("Se requiere --yes cuando no hay una terminal interactiva")
  }
  return promptConfirmation(question)
}

async function interactiveInstallOptions(): Promise<CliOptions | null> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("El asistente requiere una terminal interactiva")
  }
  const selected = await promptInstallOptions(process.cwd())
  if (!selected) return null
  return {
    targets: selected.targets,
    context: {
      assetsRoot: DEFAULT_ASSETS_ROOT,
      homeDir: path.resolve(homedir()),
      projectRoot: selected.projectRoot,
      scope: selected.scope,
    },
    force: false,
    yes: false,
    dryRun: false,
    json: false,
  }
}

async function runList(options: CliOptions): Promise<void> {
  const catalog = await loadCatalog(options.context.assetsRoot)
  const payload = {
    agents: catalog.agents.map((item) => item.name),
    commands: catalog.commands.map((item) => item.name),
    skills: catalog.skills.map((item) => item.name),
    openCodePlugins: catalog.openCodePlugins.map((item) => item.relativePath),
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    return
  }
  process.stdout.write(`Agentes (${payload.agents.length}): ${payload.agents.join(", ")}\n`)
  process.stdout.write(`Comandos (${payload.commands.length}): ${payload.commands.join(", ")}\n`)
  process.stdout.write(`Skills (${payload.skills.length}): ${payload.skills.join(", ")}\n`)
  process.stdout.write(
    `Plugins OpenCode (${payload.openCodePlugins.length}): ${payload.openCodePlugins.join(", ")}\n`,
  )
}

async function skillNames(root: string): Promise<Array<{ name: string; path: string }>> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }

  const skills: Array<{ name: string; path: string }> = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillPath = path.join(root, entry.name, "SKILL.md")
    try {
      const parsed = parseMarkdown(await readFile(skillPath, "utf8"))
      const name = typeof parsed.frontmatter.name === "string" ? parsed.frontmatter.name.trim() : ""
      if (name) skills.push({ name, path: skillPath })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
  return skills
}

async function duplicateCodexSkills(context: BuildContext): Promise<Array<{ name: string; paths: string[] }>> {
  const roots = [
    path.join(context.homeDir, ".codex", "skills", ".system"),
    path.join(context.homeDir, ".agents", "skills"),
  ]
  if (context.scope === "project") {
    roots.push(path.join(context.projectRoot, ".agents", "skills"))
  }

  const entries = (await Promise.all(roots.map(skillNames))).flat()
  const byName = new Map<string, string[]>()
  for (const entry of entries) {
    const paths = byName.get(entry.name) ?? []
    paths.push(entry.path)
    byName.set(entry.name, paths)
  }
  return [...byName.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([name, paths]) => ({ name, paths: paths.sort() }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

async function checkCodexSecretRules(
  rulePath: string | undefined,
): Promise<{ status: "passed" | "failed" | "not_installed" | "unavailable"; detail: string }> {
  if (!rulePath) return { status: "not_installed", detail: "No se genero la politica ms-secrets" }
  try {
    await readFile(rulePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "not_installed", detail: "La politica ms-secrets aun no esta instalada" }
    }
    throw error
  }

  const cases = [
    { args: ["cat", ".env"], forbidden: true },
    { args: ["cat", ".env.secret"], forbidden: true },
    { args: ["/bin/cat", ".env.local"], forbidden: true },
    { args: ["head", "-n", "1", ".npmrc"], forbidden: true },
    { args: ["head", "-c", "50", ".env"], forbidden: true },
    { args: ["head", "-5", ".env"], forbidden: true },
    { args: ["sed", "-n", "1p", ".env"], forbidden: true },
    { args: ["sed", "-n", "2p", ".env"], forbidden: true },
    { args: ["awk", "{print}", ".netrc"], forbidden: true },
    { args: ["awk", "/DATABASE_URL/", ".env"], forbidden: true },
    { args: ["rg", "TOKEN", ".env.secret"], forbidden: true },
    { args: ["rg", "DATABASE_URL", ".env"], forbidden: true },
    { args: ["rg", "-n", "TOKEN", ".env.secret"], forbidden: true },
    { args: ["grep", "PASSWORD", ".env.production"], forbidden: true },
    { args: ["grep", "DATABASE_URL", ".env"], forbidden: true },
    { args: ["grep", "-n", "PASSWORD", ".env"], forbidden: true },
    { args: ["env"], forbidden: true },
    { args: ["git", "diff", "--", ".env"], forbidden: true },
    { args: ["git", "show", "HEAD:.env"], forbidden: true },
    { args: ["cat", ".env.example"], forbidden: false },
    { args: ["cat", "README.md"], forbidden: false },
    { args: ["sed", "-n", "1p", "README.md"], forbidden: false },
    { args: ["rg", "TOKEN", ".env.example"], forbidden: false },
    { args: ["head", "-c", "50", ".env.example"], forbidden: false },
    { args: ["rg", "-n", "TOKEN", ".env.example"], forbidden: false },
    { args: ["grep", "-n", "PASSWORD", "README.md"], forbidden: false },
    { args: ["git", "diff", "--", ".env.example"], forbidden: false },
    { args: ["git", "show", "HEAD:.env.example"], forbidden: false },
  ] as const

  try {
    const results = await Promise.all(
      cases.map(async (testCase) => {
        const { stdout } = await execFileAsync("codex", [
          "execpolicy",
          "check",
          "--rules",
          rulePath,
          "--",
          ...testCase.args,
        ])
        const result = JSON.parse(stdout) as { decision?: string }
        const isForbidden = result.decision === "forbidden"
        return { ...testCase, decision: result.decision, passed: isForbidden === testCase.forbidden }
      }),
    )
    const failed = results.filter((result) => !result.passed)
    if (failed.length === 0) {
      return {
        status: "passed",
        detail: `Defensa practica best-effort validada: ${results.length}/${results.length} casos`,
      }
    }
    return {
      status: "failed",
      detail: `Matriz best-effort incompleta (${results.length - failed.length}/${results.length}): ${failed
        .map(
          (result) =>
            `${result.args.join(" ")} esperaba ${result.forbidden ? "forbidden" : "no forbidden"} y obtuvo ${result.decision ?? "sin decision"}`,
        )
        .join("; ")}`,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "unavailable", detail: "No se encontro el binario codex" }
    }
    return { status: "failed", detail: `Codex no pudo validar la politica: ${(error as Error).message}` }
  }
}

async function runDoctor(options: CliOptions): Promise<void> {
  const catalog = await loadCatalog(options.context.assetsRoot)
  const artifacts = await buildArtifacts(options.targets, options.context)
  const plan = await createPlan(artifacts, options.context)
  const managedStatus = await installationStatus(options.targets, options.context)
  const counts = Object.fromEntries(
    options.targets.map((target) => [
      target,
      artifacts.filter((item) => owningTargets(item).includes(target)).length,
    ]),
  )
  const installations = Object.fromEntries(
    options.targets.map((target) => {
      const targetStatus = managedStatus.filter((item) => item.target === target)
      const targetPlan = { create: 0, update: 0, adopt: 0, unchanged: 0, conflict: 0, cleanup: 0 }
      for (const item of plan.items) {
        if (owningTargets(item.artifact).includes(target)) targetPlan[item.action] += 1
      }
      targetPlan.cleanup = plan.obsolete.filter((item) =>
        item.obsoleteTargets.includes(target),
      ).length
      return [
        target,
        {
          managed: targetStatus.length,
          status: {
            ok: targetStatus.filter((item) => item.status === "ok").length,
            modified: targetStatus.filter((item) => item.status === "modified").length,
            missing: targetStatus.filter((item) => item.status === "missing").length,
          },
          desired: targetPlan,
        },
      ]
    }),
  ) as Record<
    Target,
    {
      managed: number
      status: { ok: number; modified: number; missing: number }
      desired: Record<"create" | "update" | "adopt" | "unchanged" | "conflict" | "cleanup", number>
    }
  >

  const warnings: string[] = []
  let ok = true
  for (const target of options.targets) {
    const installation = installations[target]
    if (installation.managed === 0) {
      warnings.push(`${target}: no hay una instalacion administrada en este scope`)
    } else if (
      installation.desired.create > 0 ||
      installation.desired.update > 0 ||
      installation.desired.adopt > 0 ||
      installation.desired.cleanup > 0
    ) {
      ok = false
      warnings.push(`${target}: hay cambios pendientes; ejecuta install`)
    }
    if (installation.desired.conflict > 0) {
      ok = false
      warnings.push(`${target}: hay ${installation.desired.conflict} conflicto(s)`)
    }
    if (installation.status.modified > 0 || installation.status.missing > 0) ok = false
  }

  const codexRule = artifacts.find(
    (artifact) =>
      owningTargets(artifact).includes("codex") &&
      artifact.kind === "policy" &&
      artifact.name === "ms-secrets",
  )
  const codexSecurity = options.targets.includes("codex")
    ? await checkCodexSecretRules(codexRule?.destination)
    : null
  if (codexSecurity && installations.codex.managed > 0 && codexSecurity.status !== "passed") {
    ok = false
    warnings.push(`codex: ${codexSecurity.detail}`)
  }

  const duplicateSkills = options.targets.includes("codex")
    ? await duplicateCodexSkills(options.context)
    : []
  if (duplicateSkills.length > 0) {
    ok = false
    warnings.push(`codex: hay ${duplicateSkills.length} nombre(s) de skill duplicados`)
  }

  const payload = {
    ok,
    node: process.version,
    assetsRoot: options.context.assetsRoot,
    agents: catalog.agents.length,
    commands: catalog.commands.length,
    skills: catalog.skills.length,
    artifacts: counts,
    installation: installations,
    security: { codexSecretRules: codexSecurity },
    duplicateSkills,
    warnings,
  }
  process.stdout.write(
    options.json
      ? `${JSON.stringify(payload, null, 2)}\n`
      : `Doctor ${ok ? "OK" : "CON PROBLEMAS"}: ${payload.agents} agentes, ${payload.commands} comandos, ${payload.skills} skills. Instalacion: ${options.targets.map((target) => `${target} ${installations[target].status.ok}/${installations[target].managed}`).join(", ")}${warnings.length > 0 ? `. Avisos: ${warnings.join("; ")}` : ""}\n`,
  )
  if (!ok) process.exitCode = 1
}

async function buildCliPlan(options: CliOptions): Promise<InstallPlan> {
  const artifacts = await buildArtifacts(options.targets, options.context)
  return createPlan(artifacts, options.context, options.force)
}

async function runPlan(options: CliOptions): Promise<InstallPlan> {
  const plan = await buildCliPlan(options)
  printPlan(plan, options.json)
  return plan
}

async function runInstall(options: CliOptions, resolveConflicts = false): Promise<void> {
  let activeOptions = options
  let plan = await buildCliPlan(activeOptions)
  if (options.dryRun) {
    printPlan(plan, options.json)
    return
  }
  if (!options.json) {
    if (resolveConflicts) printInteractivePlan(plan, activeOptions)
    else printPlan(plan, false)
  }
  if (plan.items.some((item) => item.action === "conflict")) {
    if (!resolveConflicts) {
      throw new Error("Hay conflictos. Revisa el plan o repite con --force")
    }
    const conflictCount = plan.items.filter((item) => item.action === "conflict").length
    const replace = await confirm(
      `Hay ${conflictCount} conflictos. ¿Crear backups y reemplazar esos archivos completos?`,
      false,
    )
    if (replace === null) return
    if (!replace) {
      process.stdout.write("Instalacion cancelada\n")
      return
    }
    activeOptions = { ...options, force: true }
    plan = await buildCliPlan(activeOptions)
    printInteractivePlan(plan, activeOptions)
  }
  const counts = planSummary(plan)
  if (resolveConflicts && !planNeedsConfirmation(counts)) {
    await applyPlan(plan, activeOptions.context)
    finishWithoutChanges()
    return
  }
  const changes = plannedChangeCount(counts)
  const question =
    changes === 1
      ? "¿Aplicar 1 cambio?"
      : changes > 1
        ? `¿Aplicar ${changes} cambios?`
        : "¿Continuar con este plan?"
  const shouldApply = await confirm(question, activeOptions.yes)
  if (shouldApply === null) return
  if (!shouldApply) {
    process.stdout.write("Instalacion cancelada\n")
    return
  }
  const result = await applyPlan(plan, activeOptions.context)
  process.stdout.write(
    activeOptions.json
      ? `${JSON.stringify({ plan: planSummary(plan), result }, null, 2)}\n`
      : `Instalacion completa: ${result.created} creados, ${result.updated} actualizados, ${result.adopted} adoptados, ${result.unchanged} sin cambios, ${result.removed} obsoletos eliminados, ${result.restored} restaurados, ${result.detached} desvinculados, ${result.skipped} omitidos\n`,
  )
}

async function runStatus(options: CliOptions): Promise<void> {
  const status = await installationStatus(options.targets, options.context)
  if (options.json) {
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`)
    return
  }
  if (status.length === 0) {
    process.stdout.write("No hay archivos administrados para esos targets\n")
    return
  }
  for (const item of status) process.stdout.write(`[${item.status}] ${item.target} ${item.path}\n`)
}

async function runWorkflow(args: string[]): Promise<void> {
  const options = localOptions(args)
  const [operation, requested, ...extra] = options.positionals
  if (!operation || !["status", "next"].includes(operation) || extra.length > 0) {
    throw new Error("Uso: ms-agent-kit workflow <status|next> [slug|ruta] [--project <ruta>] [--json]")
  }
  const status = await readWorkflowStatus(options.projectRoot, requested)
  const payload = operation === "next" ? nextWorkflowAction(status) : status
  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    return
  }
  if (operation === "status") {
    process.stdout.write(
      `Workflow ${status.slug ?? "desconocido"}: ${status.status ?? "legacy"}; fase ${status.phase ?? "desconocida"}; próxima ${status.nextAction ?? "no estructurada"}; confianza ${status.confidence}\n`,
    )
    if (status.warnings.length > 0) process.stdout.write(`Avisos: ${status.warnings.join("; ")}\n`)
    return
  }
  const next = payload as ReturnType<typeof nextWorkflowAction>
  process.stdout.write(
    `Workflow ${status.slug ?? "desconocido"}: ${next.ready ? "listo" : "detenido"}; acción ${next.action ?? "ninguna"}. ${next.reason}\n`,
  )
}

async function runReview(args: string[]): Promise<void> {
  const options = localOptions(args)
  const [operation, ...extra] = options.positionals
  if (operation !== "fingerprint" || extra.length > 0) {
    throw new Error("Uso: ms-agent-kit review fingerprint [--scope worktree|staged] [--project <ruta>] [--json]")
  }
  if (options.scope !== "worktree" && options.scope !== "staged") {
    throw new Error("Scope de review no soportado: usa --scope worktree o --scope staged")
  }
  const fingerprint = await fingerprintReview(options.projectRoot, options.scope)
  process.stdout.write(
    options.json
      ? `${JSON.stringify(fingerprint, null, 2)}\n`
      : `${fingerprint.fingerprint} (${fingerprint.fileCount} archivos, +${fingerprint.additions}/-${fingerprint.deletions})\n`,
  )
}

async function runSkillRegistry(args: string[]): Promise<void> {
  const options = localOptions(args)
  const [operation, ...extra] = options.positionals
  if (operation !== "refresh" || extra.length > 0) {
    throw new Error(
      "Uso: ms-agent-kit skill-registry refresh [--project <ruta>] [--home <ruta>] [--force] [--no-gitignore] [--json]",
    )
  }
  if (!options.noGitignore) await ensureAtlIgnored(options.projectRoot)
  const result = await refreshSkillRegistry({
    projectRoot: options.projectRoot,
    homeDir: options.homeDir,
    force: options.force,
  })
  process.stdout.write(
    options.json
      ? `${JSON.stringify(result, null, 2)}\n`
      : `Skill registry ${result.cacheHit ? "sin cambios" : "actualizado"}: ${result.skills} skills en ${result.registryPath}\n`,
  )
}

async function runUninstall(options: CliOptions): Promise<void> {
  const shouldUninstall = await confirm(`Desinstalar ${options.targets.join(", ")}?`, options.yes)
  if (shouldUninstall === null) return
  if (!shouldUninstall) {
    process.stdout.write("Desinstalacion cancelada\n")
    return
  }
  const result = await uninstallTargets(options.targets, options.context)
  process.stdout.write(
    options.json
      ? `${JSON.stringify(result, null, 2)}\n`
      : `Desinstalacion completa: ${result.removed.length} eliminados, ${result.restored.length} restaurados, ${result.skipped.length} omitidos\n`,
  )
  for (const item of result.skipped) {
    process.stdout.write(`[omitido] ${item.path}: ${item.reason}\n`)
  }
}

async function main(): Promise<void> {
  const input = process.argv.slice(2)
  if (input.length === 0) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      process.stdout.write(HELP)
      return
    }
    const options = await interactiveInstallOptions()
    if (options) await runInstall(options, true)
    return
  }

  const [command, ...args] = input
  if (command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(HELP)
    return
  }

  if (command === "workflow") {
    await runWorkflow(args)
    return
  }
  if (command === "review") {
    await runReview(args)
    return
  }
  if (command === "skill-registry") {
    await runSkillRegistry(args)
    return
  }

  const options = cliOptions(args)
  switch (command) {
    case "list":
      await runList(options)
      break
    case "doctor":
      await runDoctor(options)
      break
    case "plan":
      await runPlan(options)
      break
    case "install":
      await runInstall(options)
      break
    case "status":
      await runStatus(options)
      break
    case "uninstall":
      await runUninstall(options)
      break
    default:
      throw new Error(`Comando desconocido: ${command}\n${HELP}`)
  }
}

main().catch((error) => {
  process.stderr.write(`Error: ${(error as Error).message}\n`)
  process.exitCode = 1
})
