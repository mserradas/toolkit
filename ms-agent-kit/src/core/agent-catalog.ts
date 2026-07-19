import type { ModelProfileName } from "./model-profiles.js"
import type { CapabilityProfileName } from "./profiles.js"

export type AgentMode = "primary" | "subagent"

export interface AgentDefinition {
  mode: AgentMode
  modelProfile: ModelProfileName
  capabilityProfile: CapabilityProfileName
  /** Color semántico del agente en la interfaz de OpenCode. */
  openCodeColor: `#${string}`
  /** Presupuesto portable de ciclos; cada adaptador lo materializa cuando el cliente lo permite. */
  toolCycleBudget?: number
}

export const AGENT_DEFINITIONS = {
  "ms-architect": {
    mode: "primary",
    modelProfile: "strong",
    capabilityProfile: "orchestrator",
    openCodeColor: "#8B5CF6",
  },
  "ms-codex": {
    mode: "subagent",
    modelProfile: "strong",
    capabilityProfile: "code-writer",
    openCodeColor: "#3B82F6",
    toolCycleBudget: 20,
  },
  "ms-debugger": {
    mode: "subagent",
    modelProfile: "strong",
    capabilityProfile: "bug-investigator",
    openCodeColor: "#F97316",
    toolCycleBudget: 20,
  },
  "ms-designer": {
    mode: "subagent",
    modelProfile: "strong",
    capabilityProfile: "design-writer",
    openCodeColor: "#D946EF",
    toolCycleBudget: 20,
  },
  "ms-discovery": {
    mode: "primary",
    modelProfile: "strong",
    capabilityProfile: "discovery-writer",
    openCodeColor: "#EC4899",
  },
  "ms-fastlane": {
    mode: "subagent",
    modelProfile: "balanced",
    capabilityProfile: "fastlane-writer",
    openCodeColor: "#22C55E",
    toolCycleBudget: 20,
  },
  "ms-plan": {
    mode: "primary",
    modelProfile: "strong",
    capabilityProfile: "prd-writer",
    openCodeColor: "#6366F1",
  },
  "ms-progress": {
    mode: "subagent",
    modelProfile: "light",
    capabilityProfile: "progress-writer",
    openCodeColor: "#64748B",
    toolCycleBudget: 20,
  },
  "ms-scout": {
    mode: "subagent",
    modelProfile: "light",
    capabilityProfile: "code-scout",
    openCodeColor: "#06B6D4",
    toolCycleBudget: 20,
  },
  "ms-security-auditor": {
    mode: "subagent",
    modelProfile: "strong",
    capabilityProfile: "security-auditor",
    openCodeColor: "#EF4444",
    toolCycleBudget: 20,
  },
  "ms-spec": {
    mode: "subagent",
    modelProfile: "strong",
    capabilityProfile: "spec-writer",
    openCodeColor: "#14B8A6",
    toolCycleBudget: 20,
  },
  "ms-tester": {
    mode: "subagent",
    modelProfile: "light",
    capabilityProfile: "test-runner",
    openCodeColor: "#EAB308",
    toolCycleBudget: 20,
  },
  "ms-writer": {
    mode: "subagent",
    modelProfile: "balanced",
    capabilityProfile: "documentation-writer",
    openCodeColor: "#84CC16",
    toolCycleBudget: 20,
  },
} as const satisfies Record<string, AgentDefinition>

export function agentDefinition(name: string): AgentDefinition {
  const definition = AGENT_DEFINITIONS[name as keyof typeof AGENT_DEFINITIONS]
  if (!definition) throw new Error(`No existe una definición central para el agente ${name}`)
  return definition
}
