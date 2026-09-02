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
  writes: boolean
  writePaths: readonly string[]
  shell: boolean
  usesSkills: boolean
  asksQuestions: boolean
  orchestrates: boolean
  webFetch: boolean
  webSearch: boolean
}

const CAPABILITY_PROFILES: Record<CapabilityProfileName, CapabilityProfile> = {
  orchestrator: {
    writes: false,
    writePaths: [],
    shell: true,
    usesSkills: true,
    asksQuestions: true,
    orchestrates: true,
    webFetch: true,
    webSearch: false,
  },
  "code-writer": {
    writes: true,
    writePaths: ["**"],
    shell: true,
    usesSkills: true,
    asksQuestions: false,
    orchestrates: false,
    webFetch: true,
    webSearch: false,
  },
  "bug-investigator": {
    writes: false,
    writePaths: [],
    shell: true,
    usesSkills: false,
    asksQuestions: false,
    orchestrates: false,
    webFetch: false,
    webSearch: false,
  },
  "design-writer": {
    writes: true,
    writePaths: [".agents/docs/design/*.md", ".agents/docs/design/**/*.md"],
    shell: false,
    usesSkills: true,
    asksQuestions: false,
    orchestrates: false,
    webFetch: true,
    webSearch: false,
  },
  "discovery-writer": {
    writes: true,
    writePaths: [".agents/docs/discovery/*.md", ".agents/docs/discovery/**/*.md"],
    shell: false,
    usesSkills: false,
    asksQuestions: true,
    orchestrates: false,
    webFetch: true,
    webSearch: false,
  },
  "fastlane-writer": {
    writes: true,
    writePaths: ["**"],
    shell: true,
    usesSkills: true,
    asksQuestions: false,
    orchestrates: false,
    webFetch: false,
    webSearch: false,
  },
  "prd-writer": {
    writes: true,
    writePaths: [".agents/docs/prd/*.md", ".agents/docs/prd/**/*.md"],
    shell: false,
    usesSkills: false,
    asksQuestions: true,
    orchestrates: false,
    webFetch: true,
    webSearch: false,
  },
  "code-scout": {
    writes: false,
    writePaths: [],
    shell: true,
    usesSkills: false,
    asksQuestions: false,
    orchestrates: false,
    webFetch: false,
    webSearch: false,
  },
  "security-auditor": {
    writes: false,
    writePaths: [],
    shell: true,
    usesSkills: false,
    asksQuestions: false,
    orchestrates: false,
    webFetch: false,
    webSearch: false,
  },
  "spec-writer": {
    writes: true,
    writePaths: [".agents/docs/spec/*.md", ".agents/docs/spec/**/*.md"],
    shell: false,
    usesSkills: true,
    asksQuestions: false,
    orchestrates: false,
    webFetch: true,
    webSearch: false,
  },
  "test-runner": {
    writes: false,
    writePaths: [],
    shell: true,
    usesSkills: true,
    asksQuestions: false,
    orchestrates: false,
    webFetch: false,
    webSearch: false,
  },
  "documentation-writer": {
    writes: true,
    writePaths: [
      "README.md",
      "CHANGELOG.md",
      "docs/changelog/*.md",
      "docs/changelog/**/*.md",
      "docs/guides/*.md",
      "docs/guides/**/*.md",
      "docs/api/*.md",
      "docs/api/**/*.md",
      "docs/release-notes/*.md",
      "docs/release-notes/**/*.md",
    ],
    shell: false,
    usesSkills: true,
    asksQuestions: false,
    orchestrates: false,
    webFetch: true,
    webSearch: false,
  },
}

export function capabilityProfile(name: CapabilityProfileName): CapabilityProfile {
  return CAPABILITY_PROFILES[name]
}

export const COORDINATION_SKILLS = ["ms-architect", "ms-project-init", "ms-artifact-lifecycle", "delegation-brief", "work-unit-commits", "judgment-day", "ms-handoff"] as const
export function technicalSkillsOnly(name: CapabilityProfileName): boolean {
  return ["code-writer", "fastlane-writer", "test-runner"].includes(name)
}
