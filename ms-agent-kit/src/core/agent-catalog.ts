import type { ModelProfileName } from "./model-profiles.js"
import type { CapabilityProfileName } from "./profiles.js"

export type AgentMode = "primary" | "subagent"

export interface AgentDefinition {
  mode: AgentMode
  modelProfile: ModelProfileName
  capabilityProfile: CapabilityProfileName
}

export const AGENT_DEFINITIONS = {
  "ms-architect": {
    mode: "primary",
    modelProfile: "strong",
    capabilityProfile: "orchestrator",
  },
  "ms-codex": {
    mode: "subagent",
    modelProfile: "strong",
    capabilityProfile: "code-writer",
  },
  "ms-debugger": {
    mode: "subagent",
    modelProfile: "strong",
    capabilityProfile: "bug-investigator",
  },
  "ms-designer": {
    mode: "subagent",
    modelProfile: "strong",
    capabilityProfile: "design-writer",
  },
  "ms-discovery": {
    mode: "primary",
    modelProfile: "strong",
    capabilityProfile: "discovery-writer",
  },
  "ms-fastlane": {
    mode: "subagent",
    modelProfile: "balanced",
    capabilityProfile: "fastlane-writer",
  },
  "ms-plan": {
    mode: "primary",
    modelProfile: "strong",
    capabilityProfile: "prd-writer",
  },
  "ms-progress": {
    mode: "subagent",
    modelProfile: "light",
    capabilityProfile: "progress-writer",
  },
  "ms-scout": {
    mode: "subagent",
    modelProfile: "light",
    capabilityProfile: "code-scout",
  },
  "ms-security-auditor": {
    mode: "subagent",
    modelProfile: "strong",
    capabilityProfile: "security-auditor",
  },
  "ms-spec": {
    mode: "subagent",
    modelProfile: "strong",
    capabilityProfile: "spec-writer",
  },
  "ms-tester": {
    mode: "subagent",
    modelProfile: "light",
    capabilityProfile: "test-runner",
  },
  "ms-writer": {
    mode: "subagent",
    modelProfile: "balanced",
    capabilityProfile: "documentation-writer",
  },
} as const satisfies Record<string, AgentDefinition>

export function agentDefinition(name: string): AgentDefinition {
  const definition = AGENT_DEFINITIONS[name as keyof typeof AGENT_DEFINITIONS]
  if (!definition) throw new Error(`No existe una definicion central para el agente ${name}`)
  return definition
}
