import path from "node:path"
import type { ProjectCommand } from "./project-context.js"
import { capabilityProfile, documentaryInspectionCommands } from "./profiles.js"
import type { BuildContext, Target } from "./types.js"
import { verificationForRole } from "./verification-policy.js"

export type CommandDecision = "allow" | "ask" | "deny" | "unknown"
export type CommandRole = "ms-architect" | "ms-codex" | "ms-fastlane" | "ms-tester" | "ms-designer" | "ms-spec"
export interface CommandPreflight {
  command: string
  cwd: string
  source: string
  target: Target
  role: CommandRole
  decision: CommandDecision
  policy: { decision: CommandDecision; source: string }
  effects: { status: "known" | "unknown"; writes: string[] | null }
  services: { status: "unknown"; required: null }
  runtime: "unknown"
  projectAuthorization: { command: boolean; outputPaths: string[]; source: string | null }
  reasons: string[]
}

/** Conservative static subset; runtime clients own full shell parsing. */
function simpleOperations(command: string): string[] | null {
  if (!/^[a-zA-Z0-9_./:@= &|;-]+$/.test(command)) return null
  const parts = command.split(/&&|\|\||[;|]/).map((part) => part.trim())
  return parts.some((part) => !part || part.includes("&")) ? null : parts
}

/** No client receives kit permission rules; native settings remain unprobed. */
export function staticCommandDecision(_command: string, _role: CommandRole, _context: BuildContext, _includeProjectGrants = true): CommandDecision {
  return "unknown"
}

/** Pure preflight: project metadata never authorizes execution or filesystem writes. */
export function commandPreflight(operation: ProjectCommand, target: Target, role: CommandRole, context: BuildContext): CommandPreflight {
  const cwd = path.resolve(context.projectRoot, operation.cwd)
  const relative = path.relative(context.projectRoot, cwd)
  const grant = relative === "" ? verificationForRole(role, context) : { commands: [], outputPaths: [] }
  const commandAuthorized = grant.commands.includes(operation.command)
  const operations = simpleOperations(operation.command)
  const simple = operations !== null
  const authorizationSource = commandAuthorized ? path.join(context.homeDir, ".ms-agent-kit/config.yaml") + "#verification.projects" : null
  const policySource = `${target}: sin política de permisos del kit; configuración nativa no comprobada`
  const reasons = ["El kit no añade permisos. Los permisos efectivos, overrides, binarios y servicios de la sesión no se han comprobado; unknown no significa denegación ni solicitud de permiso."]
  if (!simple) reasons.push("Sintaxis no interpretada por este preflight; no se infiere permiso ni denegación.")
  const outside = relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
  if (outside) reasons.push("El cwd está fuera del proyecto.")
  // Lista cerrada de consultas de inspección; no interpreta recetas ni argumentos arbitrarios.
  const knownEffects = ["pwd", "git status", "git status --short", "git status --porcelain", "git --version", "node --version", ...documentaryInspectionCommands(capabilityProfile("design-writer")), ...documentaryInspectionCommands(capabilityProfile("spec-writer"))].includes(operation.command)
  if (!knownEffects) reasons.push("Efectos de escritura desconocidos: no se inspeccionan recetas, scripts, wrappers ni configuración de herramientas; Make/Compose no se autorizan por nombre.")
  if (role === "ms-tester" && !knownEffects) reasons.push("El tester informa de la verificación; los directorios de resultados declarados no prueban los efectos reales del comando.")
  if (commandAuthorized) reasons.push("Comando exacto autorizado por configuración personal para esta raíz; las salidas autorizadas no demuestran efectos reales ni ejecución.")
  return {
    ...operation, target, role, decision: "unknown",
    policy: { decision: "unknown", source: policySource },
    effects: { status: knownEffects ? "known" : "unknown", writes: knownEffects ? [] : null },
    services: { status: "unknown", required: null }, runtime: "unknown", reasons,
    projectAuthorization: { command: commandAuthorized, outputPaths: commandAuthorized ? grant.outputPaths : [], source: authorizationSource },
  }
}
