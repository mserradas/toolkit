import { loadCatalog } from "../core/catalog.js"
import { loadKitConfiguration, validateKitConfiguration } from "../core/kit-config.js"
import { readProjectFile } from "../core/project-context.js"
import { owningTargets, type Artifact, type BuildContext, type Target } from "../core/types.js"
import { buildClaudeArtifacts } from "./claude.js"
import { buildCodexArtifacts } from "./codex.js"
import { buildOpenCodeArtifacts } from "./opencode.js"

export async function buildArtifacts(
  targets: Target[],
  context: BuildContext,
): Promise<Artifact[]> {
  const kitConfiguration = context.kitConfiguration ? validateKitConfiguration(context.kitConfiguration) : await loadKitConfiguration(context.homeDir)
  const resolvedContext: BuildContext = { ...context }
  delete resolvedContext.projectPreferences
  if (kitConfiguration) resolvedContext.kitConfiguration = kitConfiguration
  if (context.scope === "project") {
    try {
      const preferences = (await readProjectFile(context.projectRoot))?.preferences
      if (preferences) resolvedContext.projectPreferences = preferences
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
  const catalog = await loadCatalog(context.assetsRoot)
  const artifacts: Artifact[] = []

  for (const target of targets) {
    switch (target) {
      case "opencode":
        artifacts.push(...buildOpenCodeArtifacts(catalog, resolvedContext))
        break
      case "claude":
        artifacts.push(...buildClaudeArtifacts(catalog, resolvedContext))
        break
      case "codex":
        artifacts.push(...buildCodexArtifacts(catalog, resolvedContext))
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
