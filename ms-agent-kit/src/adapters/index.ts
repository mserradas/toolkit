import { loadCatalog } from "../core/catalog.js"
import { owningTargets, type Artifact, type BuildContext, type Target } from "../core/types.js"
import { buildClaudeArtifacts } from "./claude.js"
import { buildCodexArtifacts } from "./codex.js"
import { buildOpenCodeArtifacts } from "./opencode.js"

export async function buildArtifacts(
  targets: Target[],
  context: BuildContext,
): Promise<Artifact[]> {
  const catalog = await loadCatalog(context.assetsRoot)
  const artifacts: Artifact[] = []

  for (const target of targets) {
    switch (target) {
      case "opencode":
        artifacts.push(...buildOpenCodeArtifacts(catalog, context))
        break
      case "claude":
        artifacts.push(...buildClaudeArtifacts(catalog, context))
        break
      case "codex":
        artifacts.push(...buildCodexArtifacts(catalog, context))
        break
    }
  }

  const deduplicated = new Map<string, Artifact>()
  for (const artifact of artifacts) {
    const existing = deduplicated.get(artifact.destination)
    if (!existing) {
      deduplicated.set(artifact.destination, artifact)
      continue
    }
    if (
      existing.kind !== artifact.kind ||
      existing.name !== artifact.name ||
      existing.root !== artifact.root ||
      existing.mode !== artifact.mode ||
      !existing.content.equals(artifact.content)
    ) {
      throw new Error(`Dos artefactos intentan escribir en ${artifact.destination}`)
    }
    existing.targets = [...new Set([...owningTargets(existing), ...owningTargets(artifact)])]
  }

  return [...deduplicated.values()].sort((left, right) =>
    left.destination.localeCompare(right.destination),
  )
}
