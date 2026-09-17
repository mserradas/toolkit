import { DEVELOPMENT_ROLES } from "./development-policy.js"

/** Reads need no endpoint or argument allowlist. Remote changes remain explicit. */
export function githubBashRules(role: string): Record<string, "ask" | "deny"> {
  if (!(DEVELOPMENT_ROLES as readonly string[]).includes(role)) return {}
  const rules: Record<string, "ask" | "deny"> = {}
  for (const action of ["delete", "merge", "close", "reopen", "comment", "review", "rerun", "cancel", "upload", "enable", "disable", "set", "remove", "sync", "rename", "transfer", "lock", "unlock"]) rules[`gh * ${action} *`] = "ask"
  for (const resource of ["repo", "release", "label", "project", ...(role === "ms-architect" ? [] : ["issue", "pr"])]) {
    for (const action of ["create", "edit"]) rules[`gh ${resource} ${action} *`] = "ask"
  }
  for (const command of ["gh workflow run", "gh auth", "gh alias", "gh extension", "gh api graphql"]) rules[`${command} *`] = "ask"
  // Fields change the implicit GET to POST; method/input/host overrides need review.
  for (const flag of ["-f", "-F", "--field", "--raw-field", "--input", "--hostname"]) {
    rules[`gh api ${flag}*`] = "ask"
    rules[`gh api * ${flag}*`] = "ask"
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    rules[`gh api *${method}*`] = "ask"
  }
  rules["gh auth token *"] = "deny"
  return rules
}
