export type CapabilityProfileName =
  | "orchestrator"
  | "code-writer"
  | "bug-investigator"
  | "design-writer"
  | "discovery-writer"
  | "fastlane-writer"
  | "prd-writer"
  | "progress-writer"
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
  web: boolean
}

const CAPABILITY_PROFILES: Record<CapabilityProfileName, CapabilityProfile> = {
  orchestrator: {
    writes: false,
    writePaths: [],
    shell: true,
    usesSkills: true,
    asksQuestions: true,
    orchestrates: true,
    web: true,
  },
  "code-writer": {
    writes: true,
    writePaths: ["**"],
    shell: true,
    usesSkills: false,
    asksQuestions: false,
    orchestrates: false,
    web: false,
  },
  "bug-investigator": {
    writes: false,
    writePaths: [],
    shell: true,
    usesSkills: false,
    asksQuestions: false,
    orchestrates: false,
    web: false,
  },
  "design-writer": {
    writes: true,
    writePaths: ["docs/design/*.md", "docs/design/**/*.md"],
    shell: false,
    usesSkills: true,
    asksQuestions: true,
    orchestrates: false,
    web: true,
  },
  "discovery-writer": {
    writes: true,
    writePaths: ["docs/discovery/*.md", "docs/discovery/**/*.md"],
    shell: false,
    usesSkills: false,
    asksQuestions: true,
    orchestrates: false,
    web: true,
  },
  "fastlane-writer": {
    writes: true,
    writePaths: ["**"],
    shell: true,
    usesSkills: false,
    asksQuestions: false,
    orchestrates: false,
    web: false,
  },
  "prd-writer": {
    writes: true,
    writePaths: ["docs/prd/*.md", "docs/prd/**/*.md"],
    shell: false,
    usesSkills: false,
    asksQuestions: true,
    orchestrates: false,
    web: true,
  },
  "progress-writer": {
    writes: true,
    writePaths: ["docs/status/*.md", "docs/status/**/*.md"],
    shell: false,
    usesSkills: false,
    asksQuestions: false,
    orchestrates: false,
    web: false,
  },
  "code-scout": {
    writes: false,
    writePaths: [],
    shell: true,
    usesSkills: false,
    asksQuestions: false,
    orchestrates: false,
    web: false,
  },
  "security-auditor": {
    writes: false,
    writePaths: [],
    shell: true,
    usesSkills: false,
    asksQuestions: false,
    orchestrates: false,
    web: true,
  },
  "spec-writer": {
    writes: true,
    writePaths: ["docs/spec/*.md", "docs/spec/**/*.md"],
    shell: false,
    usesSkills: true,
    asksQuestions: true,
    orchestrates: false,
    web: true,
  },
  "test-runner": {
    writes: false,
    writePaths: [],
    shell: true,
    usesSkills: false,
    asksQuestions: false,
    orchestrates: false,
    web: false,
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
    web: false,
  },
}

export function capabilityProfile(name: CapabilityProfileName): CapabilityProfile {
  return CAPABILITY_PROFILES[name]
}
