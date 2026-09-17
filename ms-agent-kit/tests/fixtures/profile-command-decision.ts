import { openCodeRolePermission } from "../../src/core/opencode-role-permissions.js"
import { OPENCODE_SECRET_BASH_RULES } from "../../src/core/permissions.js"
import { withVerificationCommands } from "../../src/core/verification-policy.js"
import type { BuildContext } from "../../src/core/types.js"
import type { CommandDecision, CommandRole } from "../../src/core/command-preflight.js"

function matches(pattern: string, command: string): boolean {
  let expression = pattern.replaceAll("\\", "/").replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")
  if (expression.endsWith(" .*")) expression = expression.slice(0, -3) + "( .*)?"
  return new RegExp(`^${expression}$`, "s").test(command.replaceAll("\\", "/"))
}

/** Conservative static subset; runtime clients own full shell parsing. */
function simpleOperations(command: string): string[] | null {
  if (!/^[a-zA-Z0-9_./:@= &|;-]+$/.test(command)) return null
  const parts = command.split(/&&|\|\||[;|]/).map((part) => part.trim())
  return parts.some((part) => !part || part.includes("&")) ? null : parts
}

/** Evaluates the legacy rule table still used by the Claude guard. */
export function profileCommandDecision(command: string, role: CommandRole, context: BuildContext, includeProjectGrants = true): CommandDecision {
  const operations = simpleOperations(command)
  if (!operations) return "unknown"
  if (operations.length > 1) {
    if (context.permissionProfile === "strict") return "unknown"
    const decisions = operations.map((operation) => profileCommandDecision(operation, role, context, includeProjectGrants))
    return decisions.includes("deny") ? "deny" : decisions.includes("unknown") ? "unknown" : decisions.includes("ask") ? "ask" : "allow"
  }
  const policy = openCodeRolePermission(role, context.permissionProfile ?? "balanced")
  const bash = (includeProjectGrants ? withVerificationCommands(policy, role, context) : policy).bash
  if (!bash || typeof bash !== "object" || Array.isArray(bash)) return "unknown"
  const rules: Record<string, unknown> = { ...bash, ...OPENCODE_SECRET_BASH_RULES }
  let decision: CommandDecision = "unknown"
  for (const [pattern, value] of Object.entries(rules)) {
    if (!matches(pattern, command)) continue
    decision = value === "allow" || value === "deny" || value === "ask" ? value : "unknown"
  }
  return decision
}

