export type ModelProfileName = "strong" | "balanced" | "light"
export type ReasoningEffort = "low" | "medium" | "high"

export interface ModelProfile {
  openCodeModel: string
  reasoningEffort: ReasoningEffort
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
}

export function modelProfile(name: ModelProfileName): ModelProfile {
  return MODEL_PROFILES[name]
}
