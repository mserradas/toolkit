import path from "node:path"
import { agentDefinition } from "./agent-catalog.js"
import { isSensitivePath } from "./permissions.js"
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

/** OpenCode emits no kit rules; effective client defaults and overrides are unprobed. */
export function staticCommandDecision(_command: string, _role: CommandRole, _context: BuildContext, _includeProjectGrants = true): CommandDecision {
  return "unknown"
}

/** Pure preflight: project metadata never authorizes execution or filesystem writes. */
export function commandPreflight(operation: ProjectCommand, target: Target, role: CommandRole, context: BuildContext): CommandPreflight {
  const cwd = path.resolve(context.projectRoot, operation.cwd)
  const relative = path.relative(context.projectRoot, cwd)
  const grant = relative === "" ? verificationForRole(role, context) : { commands: [], outputPaths: [] }
  const commandAuthorized = grant.commands.includes(operation.command)
  const profile = capabilityProfile(agentDefinition(role).capabilityProfile)
  const operations = simpleOperations(operation.command)
  const simple = operations !== null
  const words = (operations ?? [operation.command]).flatMap((command) => command.split(/ +/))
  const sensitive = simple && words.some((word) => isSensitivePath(word.replace(/^[^=]+=/, "").replace(/^HEAD:/, "")))
  const destructive = context.permissionProfile === "strict" && (operations ?? [operation.command]).some(
    (command) => /^(?:sudo|rm|rmdir|shred|mkfs)(?: |$)|^git (?:reset|clean|push|checkout|restore)(?: |$)/.test(command),
  )
  const scopedInspection = profile.gitInspectionPaths !== undefined
  const prohibitedComposition = context.permissionProfile === "strict" && /[;&|`\n\r<>]|\$\(/.test(operation.command)
  const authorizationSource = commandAuthorized ? path.join(context.homeDir, ".ms-agent-kit/config.yaml") + "#verification.projects" : null
  const policySource = target === "opencode" ? "OpenCode: permission {}; configuración nativa no comprobada" : `capabilityProfile:${agentDefinition(role).capabilityProfile}; instrucciones compartidas; ${target === "claude" ? "guard Claude no comprobado" : "sandbox Codex no comprobado"}`
  let policyDecision: CommandDecision = target === "opencode" ? staticCommandDecision(operation.command, role, context, relative === "") : "unknown"
  const reasons = ["Los permisos efectivos, overrides, binarios y servicios de la sesión no se han comprobado."]
  if (target === "opencode") reasons.push("El kit genera permission: {}; unknown significa no comprobado, no una denegación ni una solicitud de permiso.")
  if (target !== "opencode" && (sensitive || destructive || prohibitedComposition || (scopedInspection && !documentaryInspectionCommands(profile).includes(operation.command)))) {
    policyDecision = "deny"
    reasons.push("La operación solicita secretos, una operación destructiva, sintaxis shell no admitida o excede la inspección acotada del rol.")
  } else if (!simple) {
    policyDecision = "unknown"
    reasons.push("Sintaxis no interpretada por este preflight; no se infiere permiso ni denegación.")
  }
  const outside = relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
  const wrongInspectionRoot = scopedInspection && relative !== ""
  if (outside || wrongInspectionRoot) reasons.push("El cwd está fuera del proyecto o no coincide con la raíz exigida por la inspección acotada.")
  // Lista cerrada de consultas de inspección; no interpreta recetas ni argumentos arbitrarios.
  const knownEffects = ["pwd", "git status", "git status --short", "git status --porcelain", "git --version", "node --version", ...documentaryInspectionCommands(capabilityProfile("design-writer")), ...documentaryInspectionCommands(capabilityProfile("spec-writer"))].includes(operation.command)
  if (!knownEffects) reasons.push("Efectos de escritura desconocidos: no se inspeccionan recetas, scripts, wrappers ni configuración de herramientas; Make/Compose no se autorizan por nombre.")
  if (role === "ms-tester" && !knownEffects) reasons.push("Las cachés y los reportes deben quedar en las salidas del perfil o las autorizadas por proyecto; el tester no puede editar código.")
  if (commandAuthorized) reasons.push("Comando exacto autorizado por configuración personal para esta raíz; las salidas autorizadas no demuestran efectos reales ni ejecución.")
  const decision = policyDecision === "deny" ? "deny" : outside || wrongInspectionRoot ? "unknown" : policyDecision
  return {
    ...operation, target, role, decision,
    policy: { decision: policyDecision, source: policySource },
    effects: { status: knownEffects ? "known" : "unknown", writes: knownEffects ? [] : null },
    services: { status: "unknown", required: null }, runtime: "unknown", reasons,
    projectAuthorization: { command: commandAuthorized, outputPaths: commandAuthorized ? grant.outputPaths : [], source: authorizationSource },
  }
}
