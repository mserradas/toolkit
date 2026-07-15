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
    usesSkills: false,
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
    webFetch: true,
    webSearch: false,
  },
  "design-writer": {
    writes: true,
    writePaths: ["docs/design/*.md", "docs/design/**/*.md"],
    shell: false,
    usesSkills: true,
    asksQuestions: true,
    orchestrates: false,
    webFetch: true,
    webSearch: false,
  },
  "discovery-writer": {
    writes: true,
    writePaths: ["docs/discovery/*.md", "docs/discovery/**/*.md"],
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
    usesSkills: false,
    asksQuestions: false,
    orchestrates: false,
    webFetch: false,
    webSearch: false,
  },
  "prd-writer": {
    writes: true,
    writePaths: ["docs/prd/*.md", "docs/prd/**/*.md"],
    shell: false,
    usesSkills: false,
    asksQuestions: true,
    orchestrates: false,
    webFetch: true,
    webSearch: false,
  },
  "progress-writer": {
    writes: true,
    writePaths: ["docs/status/*.md", "docs/status/**/*.md"],
    shell: false,
    usesSkills: false,
    asksQuestions: false,
    orchestrates: false,
    webFetch: false,
    webSearch: false,
  },
  "code-scout": {
    writes: false,
    writePaths: [],
    shell: true,
    usesSkills: false,
    asksQuestions: false,
    orchestrates: false,
    webFetch: true,
    webSearch: false,
  },
  "security-auditor": {
    writes: false,
    writePaths: [],
    shell: true,
    usesSkills: false,
    asksQuestions: false,
    orchestrates: false,
    webFetch: true,
    webSearch: false,
  },
  "spec-writer": {
    writes: true,
    writePaths: ["docs/spec/*.md", "docs/spec/**/*.md"],
    shell: false,
    usesSkills: true,
    asksQuestions: true,
    orchestrates: false,
    webFetch: true,
    webSearch: false,
  },
  "test-runner": {
    writes: false,
    writePaths: [],
    shell: true,
    usesSkills: false,
    asksQuestions: false,
    orchestrates: false,
    webFetch: true,
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
