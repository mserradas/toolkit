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
  return MODEL_PROFILES[name]
}
