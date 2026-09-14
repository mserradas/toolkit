import path from "node:path"
import { AGENT_DEFINITIONS, agentToolCycleBudget } from "./agent-catalog.js"
import type { KitConfiguration } from "./kit-config.js"
import { resolveAgentModel } from "./agent-models.js"
import { owningTargets, type InstallPlan, type Target } from "./types.js"

interface ManagedStatus { target: Target; path: string; status: "ok" | "modified" | "missing" }

/** Proyección estática: solo reutiliza un artefacto generado si coincide con la instalación administrada. */
export function modelConfigurationDiagnostics(
  targets: Target[],
  plan: InstallPlan | null,
  managedStatus: ManagedStatus[],
  homeDir: string,
  configuration?: KitConfiguration | null,
) {
  return targets.flatMap((target) => Object.keys(AGENT_DEFINITIONS).map((role) => {
    const resolved = resolveAgentModel(role, target, configuration)
    const inheritsTask = target === "codex" && role === "ms-architect"
    const item = plan?.items.find(({ artifact }) => owningTargets(artifact).includes(target)
      && artifact.name === role && artifact.kind === (inheritsTask ? "skill" : "agent")
      && (!inheritsTask || artifact.destination.endsWith("SKILL.md")))
    const managed = item && managedStatus.find((entry) => entry.target === target && entry.path === item.artifact.destination)
    const matches = !!item && item.action === "unchanged" && item.currentHash === item.desiredHash && managed?.status === "ok"
    const source = (origin: string) => origin === "override"
      ? path.join(homeDir, ".ms-agent-kit/config.yaml")
      : origin === "inherited" ? "tarea principal del cliente" : `src/core/agent-catalog.ts#${role}`
    const budget = { value: agentToolCycleBudget(role, target) ?? null, mechanism: target === "opencode" ? "steps" : target === "claude" ? "maxTurns" : "instruction" }
    return {
      target,
      role,
      materialization: inheritsTask ? "main-task" : "agent",
      declared: {
        appliesToAgent: !inheritsTask,
        model: resolved.model,
        reasoningEffort: resolved.reasoningEffort,
        modelSource: source(resolved.modelSource),
        reasoningEffortSource: source(resolved.reasoningEffortSource),
        budget: { ...budget, source: `src/core/agent-catalog.ts#${role}` },
      },
      installed: {
        status: matches ? "comprobado" : "no comprobado",
        source: item?.artifact.destination ?? null,
        model: matches && !inheritsTask ? resolved.model : null,
        reasoningEffort: matches && !inheritsTask ? resolved.reasoningEffort : null,
        budget: matches && !inheritsTask ? budget : null,
        detail: matches
          ? inheritsTask ? "Skill administrada coincidente; modelo y esfuerzo heredan la tarea principal, no la configuración propia declarada"
            : "Hash actual coincide con el artefacto generado y el estado administrado; no acredita carga de sesión"
          : "Artefacto ausente, no administrado, modificado o distinto de la configuración declarada; valores instalados no inferidos",
      },
      effective: {
        status: "no comprobado",
        model: null,
        reasoningEffort: null,
        budget: null,
        source: null,
        detail: "Sin observación real de la sesión; la configuración instalada no demuestra los ajustes efectivos",
      },
    }
  }))
}
