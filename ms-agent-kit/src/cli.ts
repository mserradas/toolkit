#!/usr/bin/env node

import { execFile } from "node:child_process"
import { readdir, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import process from "node:process"
import { createInterface } from "node:readline/promises"
import { parseArgs, promisify } from "node:util"
import { buildArtifacts } from "./adapters/index.js"
import { DEFAULT_ASSETS_ROOT, loadCatalog } from "./core/catalog.js"
import { parseMarkdown } from "./core/frontmatter.js"
import { applyPlan, installationStatus, uninstallTargets } from "./core/installer.js"
import { createPlan } from "./core/planner.js"
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

interface MenuOption<T> {
  label: string
  value: T
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

function planSummary(plan: InstallPlan): Record<string, number> {
  const summary: Record<string, number> = {
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

async function confirm(question: string, yes: boolean): Promise<boolean> {
  if (yes) return true
  if (!process.stdin.isTTY) {
    throw new Error("Se requiere --yes cuando no hay una terminal interactiva")
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await prompt.question(`${question} [y/N] `)).trim().toLowerCase()
    return answer === "y" || answer === "yes" || answer === "s" || answer === "si"
  } finally {
    prompt.close()
  }
}

async function selectOption<T>(
  prompt: ReturnType<typeof createInterface>,
  question: string,
  options: MenuOption<T>[],
): Promise<T> {
  while (true) {
    process.stdout.write(`\n${question}\n`)
    options.forEach((option, index) => {
      process.stdout.write(`  ${index + 1}. ${option.label}\n`)
    })
    const answer = (await prompt.question(`Selecciona una opcion [1-${options.length}]: `)).trim()
    const index = Number.parseInt(answer, 10) - 1
    const selected = options[index]
    if (selected) return selected.value
    process.stdout.write("Opcion invalida. Intentalo de nuevo.\n")
  }
}

async function interactiveInstallOptions(): Promise<CliOptions> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("El asistente requiere una terminal interactiva")
  }

  process.stdout.write("\nms-agent-kit - instalacion interactiva\n")
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const targets = await selectOption(prompt, "Que cliente quieres configurar?", [
      { label: "OpenCode", value: ["opencode"] as Target[] },
      { label: "Claude Code", value: ["claude"] as Target[] },
      { label: "Codex", value: ["codex"] as Target[] },
      { label: "Todos", value: [...TARGETS] },
    ])
    const scope = await selectOption<InstallScope>(prompt, "Donde quieres instalar la configuracion?", [
      { label: "Usuario (global)", value: "user" },
      { label: "Proyecto", value: "project" },
    ])

    let projectRoot = process.cwd()
    if (scope === "project") {
      const answer = (
        await prompt.question(`Ruta del proyecto [${projectRoot}]: `)
      ).trim()
      if (answer) projectRoot = path.resolve(answer)
    }

    return {
      targets,
      context: {
        assetsRoot: DEFAULT_ASSETS_ROOT,
        homeDir: path.resolve(homedir()),
        projectRoot: path.resolve(projectRoot),
        scope,
      },
      force: false,
      yes: false,
      dryRun: false,
      json: false,
    }
  } finally {
    prompt.close()
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

  try {
    const { stdout } = await execFileAsync("codex", [
      "execpolicy",
      "check",
      "--rules",
      rulePath,
      "--",
      "cat",
      ".env",
    ])
    const result = JSON.parse(stdout) as { decision?: string }
    return result.decision === "forbidden"
      ? { status: "passed", detail: "Codex bloquea cat .env" }
      : { status: "failed", detail: `Decision inesperada: ${result.decision ?? "ausente"}` }
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
  if (!options.json) printPlan(plan, false)
  if (plan.items.some((item) => item.action === "conflict")) {
    if (!resolveConflicts) {
      throw new Error("Hay conflictos. Revisa el plan o repite con --force")
    }
    const conflictCount = plan.items.filter((item) => item.action === "conflict").length
    const replace = await confirm(
      `Hay ${conflictCount} conflictos. Crear backups y reemplazar esos archivos completos?`,
      false,
    )
    if (!replace) {
      process.stdout.write("Instalacion cancelada\n")
      return
    }
    activeOptions = { ...options, force: true }
    plan = await buildCliPlan(activeOptions)
    printPlan(plan, false)
  }
  if (!(await confirm("Aplicar este plan?", activeOptions.yes))) {
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

async function runUninstall(options: CliOptions): Promise<void> {
  if (!(await confirm(`Desinstalar ${options.targets.join(", ")}?`, options.yes))) {
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
    await runInstall(await interactiveInstallOptions(), true)
    return
  }

  const [command, ...args] = input
  if (command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(HELP)
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
