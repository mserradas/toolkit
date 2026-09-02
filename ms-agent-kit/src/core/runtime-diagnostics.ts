import { execFile } from "node:child_process"
import { constants } from "node:fs"
import { access, realpath, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { AppError } from "./errors.js"
import { openCodeRolePermission } from "./opencode-role-permissions.js"
import { OPENCODE_SECRET_BASH_RULES } from "./permissions.js"
import { inspectProjectContext } from "./project-context.js"
import { owningTargets, type BuildContext, type InstallPlan, type Target } from "./types.js"

export type CapabilityStatus = "correcto" | "no disponible" | "incompatible" | "no comprobado"
export interface CapabilityDiagnostic {
  id: string
  target: Target | "project"
  status: CapabilityStatus
  evidence: string
  action: string | null
}

export interface ResolvedExecutable { path: string; safePath: string }
export interface ProbeOptions {
  cwd: string
  timeout: number
  maxBuffer: number
  encoding: "utf8"
  env: NodeJS.ProcessEnv
}
export type ProbeRunner = (executable: string, args: string[], options: ProbeOptions) => Promise<{ stdout: string }>
export type ExecutableResolver = (target: Target, projectRoot: string, pathValue?: string) => Promise<ResolvedExecutable | null>
const execFileAsync = promisify(execFile)
export const runProbe: ProbeRunner = async (executable, args, options) => execFileAsync(executable, args, options)

function within(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
}

export async function resolveClientExecutable(target: Target, projectRoot: string, pathValue = process.env.PATH ?? ""): Promise<ResolvedExecutable | null> {
  const root = await realpath(projectRoot)
  const directories: string[] = []
  for (const entry of pathValue.split(path.delimiter)) {
    if (!entry || !path.isAbsolute(entry) || within(path.resolve(projectRoot), path.resolve(entry))) continue
    try {
      const resolved = await realpath(entry)
      if (!within(root, resolved) && (await stat(resolved)).isDirectory() && !directories.includes(resolved)) directories.push(resolved)
    } catch (error) {
      if (!["ENOENT", "ENOTDIR", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error
    }
  }
  for (const directory of directories) {
    try {
      const executable = await realpath(path.join(directory, process.platform === "win32" ? `${target}.exe` : target))
      if (within(root, executable) || !(await stat(executable)).isFile()) continue
      await access(executable, constants.X_OK)
      return { path: executable, safePath: directories.join(path.delimiter) }
    } catch (error) {
      if (!["ENOENT", "ENOTDIR", "EACCES", "ELOOP"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error
    }
  }
  return null
}

export async function probeOptions(executable: ResolvedExecutable, projectRoot: string): Promise<ProbeOptions> {
  const root = await realpath(projectRoot)
  for (const candidate of [tmpdir(), "/tmp", "/var/tmp"]) {
    if (!path.isAbsolute(candidate)) continue
    try {
      const cwd = await realpath(candidate)
      if (within(root, cwd) || !(await stat(cwd)).isDirectory()) continue
      return { cwd, timeout: 3_000, maxBuffer: 64 * 1024, encoding: "utf8", env: { ...process.env, PATH: executable.safePath } }
    } catch (error) {
      if (!["ENOENT", "ENOTDIR", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error
    }
  }
  throw new Error("No hay directorio temporal seguro fuera del proyecto para la consulta")
}

function diagnostic(id: string, target: CapabilityDiagnostic["target"], status: CapabilityStatus, evidence: string, action: string | null = null): CapabilityDiagnostic {
  return { id, target, status, evidence, action }
}

function extractVersion(output: string): string | null {
  return /(?:^|\n)(?:(?:codex(?:-cli)?|claude(?: code)?|opencode)[ \t]+)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:[ \t\r\n]|$)/i.exec(output)?.[1] ?? null
}

function supportedCodex(version: string): boolean {
  const [major = 0, minor = 0, patch = 0] = version.split(/[.-]/).slice(0, 3).map(Number)
  return major > 0 || minor > 138 || (minor === 138 && patch >= 0 && !version.includes("-"))
}

export async function diagnoseClient(target: Target, projectRoot: string, dependencies: { resolver?: ExecutableResolver; runner?: ProbeRunner; pathValue?: string } = {}): Promise<CapabilityDiagnostic[]> {
  const executable = await (dependencies.resolver ?? resolveClientExecutable)(target, projectRoot, dependencies.pathValue)
  if (!executable) return [diagnostic("client.binary", target, "no disponible", "No se encontró un ejecutable permitido fuera del proyecto en PATH absoluto.", "Instala el cliente o corrige PATH fuera del repositorio.")]
  const results = [diagnostic("client.binary", target, "correcto", "Ejecutable externo al proyecto resuelto por realpath; PATH relativo y del proyecto excluido.")]
  let version: string | null
  try {
    const output = await (dependencies.runner ?? runProbe)(executable.path, ["--version"], await probeOptions(executable, projectRoot))
    version = extractVersion(output.stdout)
  } catch (error) {
    const timedOut = (error as NodeJS.ErrnoException).code === "ETIMEDOUT" || (typeof error === "object" && error !== null && "killed" in error && error.killed === true)
    results.push(diagnostic("client.version", target, "no comprobado", timedOut ? "La consulta --version agotó el timeout de 3 segundos." : "La consulta --version falló o excedió el límite de salida; no se publica su salida.", "Comprueba manualmente la instalación del cliente."))
    return results
  }
  if (!version) {
    results.push(diagnostic("client.version", target, "no comprobado", "La salida no contiene una versión reconocible; no se publica su contenido.", "Comprueba manualmente la versión del cliente."))
    return results
  }
  results.push(diagnostic("client.version", target, "correcto", `Versión observada: ${version}.`))
  if (target === "codex") results.push(diagnostic("client.compatibility", target, supportedCodex(version) ? "correcto" : "incompatible", `Mínimo documentado del kit: Codex 0.138.0; versión observada: ${version}.`, supportedCodex(version) ? null : "Actualiza Codex a una versión estable compatible."))
  else results.push(diagnostic("client.compatibility", target, "no comprobado", "El kit no dispone de una matriz de versiones mínima verificada para este cliente.", "Comprueba las capacidades usadas con la documentación del cliente."))
  return results
}

export type RuntimeProjectInspection = Awaited<ReturnType<typeof inspectProjectContext>> | { status: "invalid"; changedSources: string[]; project: null }
export async function inspectRuntimeProject(projectRoot: string): Promise<RuntimeProjectInspection> {
  try { return await inspectProjectContext(projectRoot) }
  catch (error) {
    if (error instanceof AppError && error.code === "STATE_INVALID") return { status: "invalid", changedSources: [], project: null }
    throw error
  }
}

export function projectContextDiagnostic(inspection: RuntimeProjectInspection): CapabilityDiagnostic {
  switch (inspection.status) {
    case "missing": return diagnostic("project.context", "project", "no disponible", "No existe .agents/project.yaml.", "Ejecuta project init si deseas contexto persistente.")
    case "invalid": return diagnostic("project.context", "project", "incompatible", "El contexto o sus fuentes no cumplen el formato o las rutas permitidas; no se regeneró.", "Revisa project.yaml y las fuentes con project inspect; conserva el contenido antes de corregirlo.")
    case "stale": return diagnostic("project.context", "project", "incompatible", `Fuentes cambiadas: ${inspection.changedSources.join(", ")}. No se ejecutaron comandos.`, "Revisa los cambios y actualiza el contexto con project init.")
    case "current": return diagnostic("project.context", "project", "correcto", "Las fuentes coinciden con el contexto persistente; los comandos no se han ejecutado.")
  }
}

function matches(pattern: string, command: string): boolean {
  const expression = pattern.split("*").map((piece) => piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")
  return new RegExp(`^${expression}$`).test(command)
}

export function staticCommandDecision(command: string, role: "ms-codex" | "ms-tester", context: BuildContext): "allow" | "deny" | "ask" | "unknown" {
  if (!/^[a-zA-Z0-9_./:@= -]+$/.test(command)) return "unknown"
  const bash = openCodeRolePermission(role, context.permissionProfile ?? "balanced").bash
  if (!bash || typeof bash !== "object" || Array.isArray(bash)) return "unknown"
  const rules: Record<string, unknown> = { ...bash, ...OPENCODE_SECRET_BASH_RULES }
  let decision: "allow" | "deny" | "ask" | "unknown" = "unknown"
  for (const [pattern, value] of Object.entries(rules)) {
    if (!matches(pattern, command)) continue
    decision = value === "allow" || value === "deny" || value === "ask" ? value : "unknown"
  }
  return decision
}

export function installationCapabilities(targets: Target[], plan: InstallPlan | null, managed: Array<{ target: Target; path: string; status: "ok" | "modified" | "missing" }>): CapabilityDiagnostic[] {
  const results: CapabilityDiagnostic[] = []
  for (const target of targets) {
    const status = managed.filter((entry) => entry.target === target)
    results.push(diagnostic("installation.integrity", target, !plan ? "no comprobado" : status.length === 0 ? "no disponible" : status.some((entry) => entry.status !== "ok") ? "incompatible" : "correcto", !plan ? "No se pudo construir el plan con el contexto inválido; los archivos administrados se inspeccionan aparte." : `${status.filter((entry) => entry.status === "ok").length}/${status.length} artefactos administrados conservan su contenido.`, !plan || status.length === 0 || status.some((entry) => entry.status !== "ok") ? "Revisa el plan y los conflictos antes de instalar." : null))
    results.push(diagnostic("runtime.agents-skills", target, "no comprobado", "La integridad de archivos no demuestra que el runtime reconozca agentes y skills.", "Comprueba el catálogo desde el cliente; doctor no inicia sesiones de modelos."))
    const config = plan?.items.find((item) => owningTargets(item.artifact).includes(target) && item.artifact.kind === "configuration" && item.artifact.name === (target === "codex" ? "context7" : "opencode.json"))
    const installed = config && !config.satisfiedExternally && config.action === "unchanged" && status.some((entry) => entry.path === config.artifact.destination && entry.status === "ok")
    results.push(diagnostic("context7.installation", target, target === "claude" ? "no disponible" : !plan ? "no comprobado" : installed ? "correcto" : "no disponible", target === "claude" ? "El kit no configura Context7 para Claude." : installed ? "El artefacto administrado de Context7 está instalado y coincide con el plan." : config?.satisfiedExternally ? "El plan detecta configuración externa; no acredita instalación administrada por el kit." : "No se verificó un artefacto administrado de Context7 instalado y vigente.", installed ? null : "Revisa la configuración documental de este cliente."))
    results.push(diagnostic("context7.runtime", target, "no comprobado", "Configuración externa, credenciales, autenticación y conectividad no comprobadas; no se leen claves ni se accede a la red.", "Valida Context7 desde el cliente cuando lo necesites."))
    results.push(diagnostic("models.availability", target, "no comprobado", "La configuración local no demuestra disponibilidad ni acceso a modelos remotos.", "Comprueba el modelo seleccionado en el cliente; doctor no realiza llamadas a modelos."))
  }
  return results
}

export function commandCapabilities(targets: Target[], inspection: RuntimeProjectInspection, context: BuildContext): CapabilityDiagnostic[] {
  const results: CapabilityDiagnostic[] = []
  for (const target of targets) {
    results.push(diagnostic("project.commands.runtime", target, "no comprobado", "No se ejecutan comandos descubiertos. Los permisos efectivos del runtime, el guard de Claude y el sandbox de Codex no se verifican.", "Revisa definición, directorio y permisos del comando antes de ejecutarlo."))
    if (target !== "opencode" || inspection.status !== "current" || !inspection.project) continue
    for (const [kind, commands] of Object.entries(inspection.project.context.commands)) {
      for (const [index, command] of commands.entries()) {
        for (const role of ["ms-codex", "ms-tester"] as const) {
          const decision = staticCommandDecision(command.command, role, context)
          results.push(diagnostic(`project.commands.static.${kind}.${index}.${role}`, target, decision === "allow" ? "correcto" : decision === "deny" ? "incompatible" : "no comprobado", `Solo política estática ${role}: ${decision}; ${command.command}, cwd=${command.cwd}, fuente=${command.source}. No comprueba scripts internos ni overrides instalados.`, decision === "allow" ? null : "Revisa la regla del rol y el comando; no amplíes permisos automáticamente."))
        }
      }
    }
  }
  return results
}
