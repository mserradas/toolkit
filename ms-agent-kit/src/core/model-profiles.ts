import type { KitConfiguration } from "./kit-config.js"
import type { Target } from "./types.js"

export type ModelProfileName = "strong" | "balanced" | "light" | "fast"
export type ReasoningEffort = "low" | "medium" | "high"

export interface ModelProfile {
  openCodeModel: string
  reasoningEffort: ReasoningEffort
  claudeModel?: string
  claudeEffort?: ReasoningEffort
}

const MODEL_PROFILES: Record<ModelProfileName, ModelProfile> = {
  strong: {
    openCodeModel: "openai/gpt-5.6-sol",
    reasoningEffort: "high",
  },
  balanced: {
    openCodeModel: "openai/gpt-5.6-sol",
    reasoningEffort: "medium",
  },
  light: {
    openCodeModel: "openai/gpt-5.6-luna",
    reasoningEffort: "low",
  },
  fast: {
    openCodeModel: "openai/gpt-5.6-luna",
    reasoningEffort: "low",
    claudeModel: "haiku",
    claudeEffort: "low",
  },
}

export function modelProfile(name: ModelProfileName): ModelProfile {
  return { ...MODEL_PROFILES[name] }
}

export interface ResolvedModelProfile {
  model: string | null
  reasoningEffort: ReasoningEffort | null
  modelSource: "default" | "override" | "inherited"
  reasoningEffortSource: "default" | "override" | "inherited"
  availability: "unchecked"
}

export function resolveModelProfile(name: ModelProfileName, target: Target, configuration?: KitConfiguration | null): ResolvedModelProfile {
  const defaults = modelProfile(name)
  const override = configuration?.models[name]?.[target]
  const model = override?.model ?? (target === "opencode" ? defaults.openCodeModel : target === "claude" ? defaults.claudeModel : undefined) ?? null
  const reasoningEffort = override?.reasoningEffort ?? (target === "claude" ? defaults.claudeEffort : defaults.reasoningEffort) ?? null
  return { model, reasoningEffort, modelSource: override?.model !== undefined ? "override" : model === null ? "inherited" : "default", reasoningEffortSource: override?.reasoningEffort !== undefined ? "override" : reasoningEffort === null ? "inherited" : "default", availability: "unchecked" }
}

export function resolvedModels(targets: Target[], configuration?: KitConfiguration | null): Record<string, Record<string, ResolvedModelProfile>> {
  return Object.fromEntries(targets.map((target) => [target, Object.fromEntries((Object.keys(MODEL_PROFILES) as ModelProfileName[]).map((name) => [name, resolveModelProfile(name, target, configuration)]))]))
}
