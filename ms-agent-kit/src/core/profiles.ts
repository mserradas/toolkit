export type CapabilityProfileName =
  | "orchestrator"
  | "code-writer"
  | "bug-investigator"
  | "design-writer"
  | "discovery-writer"
  | "fastlane-writer"
  | "prd-writer"
  | "code-scout"
  | "security-auditor"
  | "spec-writer"
  | "test-runner"
  | "documentation-writer"

export interface CapabilityProfile {
  /** Paths used to recognize read-only documentary commands in preflight. */
  gitInspectionPaths?: readonly string[]
  usesSkills: boolean
  asksQuestions: boolean
  orchestrates: boolean
}

const CAPABILITY_PROFILES: Record<CapabilityProfileName, CapabilityProfile> = {
  orchestrator: {
    usesSkills: true,
    asksQuestions: true,
    orchestrates: true,
  },
  "code-writer": {
    usesSkills: true,
    asksQuestions: false,
    orchestrates: false,
  },
  "bug-investigator": {
    usesSkills: false,
    asksQuestions: false,
    orchestrates: false,
  },
  "design-writer": {
    gitInspectionPaths: [".agents/docs/design"],
    usesSkills: true,
    asksQuestions: false,
    orchestrates: false,
  },
  "discovery-writer": {
    usesSkills: false,
    asksQuestions: true,
    orchestrates: false,
  },
  "fastlane-writer": {
    usesSkills: true,
    asksQuestions: false,
    orchestrates: false,
  },
  "prd-writer": {
    usesSkills: false,
    asksQuestions: true,
    orchestrates: false,
  },
  "code-scout": {
    usesSkills: false,
    asksQuestions: false,
    orchestrates: false,
  },
  "security-auditor": {
    usesSkills: false,
    asksQuestions: false,
    orchestrates: false,
  },
  "spec-writer": {
    gitInspectionPaths: [".agents/docs/spec"],
    usesSkills: true,
    asksQuestions: false,
    orchestrates: false,
  },
  "test-runner": {
    usesSkills: true,
    asksQuestions: false,
    orchestrates: false,
  },
  "documentation-writer": {
    usesSkills: true,
    asksQuestions: false,
    orchestrates: false,
  },
}

export function capabilityProfile(name: CapabilityProfileName): CapabilityProfile {
  return CAPABILITY_PROFILES[name]
}

export function gitInspectionCommands(profile: CapabilityProfile): string[] {
  if (!profile.gitInspectionPaths?.length) return []
  return ["git status --short", ...profile.gitInspectionPaths.flatMap((directory) =>
    [" --stat", " --name-only"].map((option) => `git --no-pager diff --no-ext-diff --no-textconv${option} -- ${directory}`),
  )]
}

export function documentaryInspectionCommands(profile: CapabilityProfile): string[] {
  if (!profile.gitInspectionPaths?.length) return []
  return [...gitInspectionCommands(profile), "pwd", "ls -d ."]
}

export const COORDINATION_SKILLS = ["ms-architect", "ms-project-init", "ms-artifact-lifecycle", "delegation-brief", "work-unit-commits", "ms-git", "ms-github", "judgment-day", "ms-handoff"] as const
export function technicalSkillsOnly(name: CapabilityProfileName): boolean {
  return ["code-writer", "fastlane-writer", "test-runner"].includes(name)
}
