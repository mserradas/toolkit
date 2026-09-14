import { AGENT_DEFINITIONS, agentDefinition, type AgentName } from "./agent-catalog.js"
import type { KitConfiguration } from "./kit-config.js"
import type { Target } from "./types.js"

export type ReasoningEffort = "low" | "medium" | "high"

export interface AgentModelDefaults {
  model: string | null
  reasoningEffort: ReasoningEffort | null
}

export interface ResolvedAgentModel extends AgentModelDefaults {
  modelSource: "default" | "override" | "inherited"
  reasoningEffortSource: "default" | "override" | "inherited"
  availability: "unchecked"
}

export function resolveAgentModel(name: string, target: Target, configuration?: KitConfiguration | null): ResolvedAgentModel {
  const defaults = agentDefinition(name).models[target]
  const override = configuration?.models[name as AgentName]?.[target]
  const model = override?.model ?? defaults.model
  const reasoningEffort = override?.reasoningEffort ?? defaults.reasoningEffort
  return {
    model,
    reasoningEffort,
    modelSource: override?.model !== undefined ? "override" : model === null ? "inherited" : "default",
    reasoningEffortSource: override?.reasoningEffort !== undefined ? "override" : reasoningEffort === null ? "inherited" : "default",
    availability: "unchecked",
  }
}

export function resolvedModels(targets: Target[], configuration?: KitConfiguration | null): Record<string, Record<string, ResolvedAgentModel>> {
  return Object.fromEntries(targets.map((target) => [target, Object.fromEntries(Object.keys(AGENT_DEFINITIONS).map((name) => [name, resolveAgentModel(name, target, configuration)]))]))
}
