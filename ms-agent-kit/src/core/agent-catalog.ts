import type { AgentModelDefaults } from "./agent-models.js"
import type { CapabilityProfileName } from "./profiles.js"
import type { Target } from "./types.js"

export type AgentMode = "primary" | "subagent"

export interface AgentDefinition {
  mode: AgentMode
  models: Record<Target, AgentModelDefaults>
  capabilityProfile: CapabilityProfileName
  /** Color semántico del agente en la interfaz de OpenCode. */
  openCodeColor: `#${string}`
}

export const AGENT_DEFINITIONS = {
  "ms-architect": {
    mode: "primary",
    models: {
      opencode: { model: "openai/gpt-5.6-sol", reasoningEffort: "high" },
      claude: { model: null, reasoningEffort: null },
      codex: { model: null, reasoningEffort: "high" },
    },
    capabilityProfile: "orchestrator",
    openCodeColor: "#8B5CF6",
  },
  "ms-codex": {
    mode: "subagent",
    models: {
      opencode: { model: "openai/gpt-5.6-sol", reasoningEffort: "high" },
      claude: { model: null, reasoningEffort: null },
      codex: { model: null, reasoningEffort: "high" },
    },
    capabilityProfile: "code-writer",
    openCodeColor: "#3B82F6",
  },
  "ms-debugger": {
    mode: "subagent",
    models: {
      opencode: { model: "openai/gpt-5.6-sol", reasoningEffort: "high" },
      claude: { model: null, reasoningEffort: null },
      codex: { model: null, reasoningEffort: "high" },
    },
    capabilityProfile: "bug-investigator",
    openCodeColor: "#F97316",
  },
  "ms-designer": {
    mode: "subagent",
    models: {
      opencode: { model: "openai/gpt-5.6-sol", reasoningEffort: "high" },
      claude: { model: null, reasoningEffort: null },
      codex: { model: null, reasoningEffort: "high" },
    },
    capabilityProfile: "design-writer",
    openCodeColor: "#D946EF",
  },
  "ms-discovery": {
    mode: "primary",
    models: {
      opencode: { model: "openai/gpt-5.6-sol", reasoningEffort: "high" },
      claude: { model: null, reasoningEffort: null },
      codex: { model: null, reasoningEffort: "high" },
    },
    capabilityProfile: "discovery-writer",
    openCodeColor: "#EC4899",
  },
  "ms-fastlane": {
    mode: "subagent",
    models: {
      opencode: { model: "openai/gpt-5.6-luna", reasoningEffort: "low" },
      claude: { model: "haiku", reasoningEffort: "low" },
      codex: { model: null, reasoningEffort: "low" },
    },
    capabilityProfile: "fastlane-writer",
    openCodeColor: "#22C55E",
  },
  "ms-plan": {
    mode: "primary",
    models: {
      opencode: { model: "openai/gpt-5.6-sol", reasoningEffort: "high" },
      claude: { model: null, reasoningEffort: null },
      codex: { model: null, reasoningEffort: "high" },
    },
    capabilityProfile: "prd-writer",
    openCodeColor: "#6366F1",
  },
  "ms-scout": {
    mode: "subagent",
    models: {
      opencode: { model: "openai/gpt-5.6-luna", reasoningEffort: "low" },
      claude: { model: null, reasoningEffort: null },
      codex: { model: null, reasoningEffort: "low" },
    },
    capabilityProfile: "code-scout",
    openCodeColor: "#06B6D4",
  },
  "ms-security-auditor": {
    mode: "subagent",
    models: {
      opencode: { model: "openai/gpt-5.6-sol", reasoningEffort: "high" },
      claude: { model: null, reasoningEffort: null },
      codex: { model: null, reasoningEffort: "high" },
    },
    capabilityProfile: "security-auditor",
    openCodeColor: "#EF4444",
  },
  "ms-spec": {
    mode: "subagent",
    models: {
      opencode: { model: "openai/gpt-5.6-sol", reasoningEffort: "high" },
      claude: { model: null, reasoningEffort: null },
      codex: { model: null, reasoningEffort: "high" },
    },
    capabilityProfile: "spec-writer",
    openCodeColor: "#14B8A6",
  },
  "ms-tester": {
    mode: "subagent",
    models: {
      opencode: { model: "openai/gpt-5.6-luna", reasoningEffort: "low" },
      claude: { model: null, reasoningEffort: null },
      codex: { model: null, reasoningEffort: "low" },
    },
    capabilityProfile: "test-runner",
    openCodeColor: "#EAB308",
  },
  "ms-writer": {
    mode: "subagent",
    models: {
      opencode: { model: "openai/gpt-5.6-sol", reasoningEffort: "medium" },
      claude: { model: null, reasoningEffort: null },
      codex: { model: null, reasoningEffort: "medium" },
    },
    capabilityProfile: "documentation-writer",
    openCodeColor: "#84CC16",
  },
} as const satisfies Record<string, AgentDefinition>

export type AgentName = keyof typeof AGENT_DEFINITIONS

export function agentDefinition(name: string): AgentDefinition {
  const definition = AGENT_DEFINITIONS[name as keyof typeof AGENT_DEFINITIONS]
  if (!definition) throw new Error(`No existe una definición central para el agente ${name}`)
  return definition
}
