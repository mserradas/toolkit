export const OPENCODE_RESERVED_WORKFLOW_SKILLS = [
  "ms-architect",
  "ms-continue",
  "ms-doctor",
  "ms-models",
  "ms-shared",
  "ms-skill-creator",
  "ms-skills",
  "ms-status",
] as const

export const UNIVERSAL_REGISTRY_EXCLUDED_SKILLS = [
  "skill-registry",
  ...OPENCODE_RESERVED_WORKFLOW_SKILLS,
] as const

const reservedOpenCodeSkills = new Set<string>(OPENCODE_RESERVED_WORKFLOW_SKILLS)

export function isPortableProjectSkill(name: string): boolean {
  return !reservedOpenCodeSkills.has(name)
}

export function restrictOpenCodeSkillPermission(current: unknown): unknown {
  if (current === "deny") return "deny"
  const base =
    typeof current === "object" && current !== null && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : { "*": current === "ask" ? "ask" : "allow" }
  return {
    ...base,
    ...Object.fromEntries(OPENCODE_RESERVED_WORKFLOW_SKILLS.map((name) => [name, "deny"])),
  }
}
