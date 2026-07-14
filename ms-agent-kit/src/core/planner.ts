import { hashContent, readExistingFile } from "./files.js"
import { readState, stateLocation } from "./state.js"
import {
  owningTargets,
  type Artifact,
  type BuildContext,
  type InstallPlan,
  type ObsoletePlanItem,
  type PlanItem,
  type Target,
} from "./types.js"

export async function createPlan(
  artifacts: Artifact[],
  context: BuildContext,
  force = false,
): Promise<InstallPlan> {
  const state = await readState(context)
  const owned = new Map(state.files.map((file) => [file.path, file]))
  const items: PlanItem[] = []
  const desiredByTarget = new Map<Target, Set<string>>()

  for (const artifact of artifacts) {
    for (const target of owningTargets(artifact)) {
      const desired = desiredByTarget.get(target) ?? new Set<string>()
      desired.add(artifact.destination)
      desiredByTarget.set(target, desired)
    }
  }

  for (const artifact of artifacts) {
    const desiredHash = hashContent(artifact.content)
    const current = await readExistingFile(artifact.destination)
    const previous = owned.get(artifact.destination)

    if (previous) {
      if (!current) {
        items.push({
          artifact,
          action: "update",
          reason: "archivo administrado ausente; se recreara",
          desiredHash,
        })
      } else if (current.hash === desiredHash) {
        items.push({
          artifact,
          action: "unchanged",
          reason: "ya esta actualizado",
          currentHash: current.hash,
          desiredHash,
        })
      } else if (current.hash === previous.afterHash) {
        items.push({
          artifact,
          action: "update",
          reason: "actualizacion segura de un archivo administrado",
          currentHash: current.hash,
          desiredHash,
        })
      } else if (force) {
        items.push({
          artifact,
          action: "update",
          reason: "archivo administrado modificado; --force adopta la version actual como backup",
          currentHash: current.hash,
          desiredHash,
        })
      } else {
        items.push({
          artifact,
          action: "conflict",
          reason: "el archivo cambio desde la ultima instalacion",
          currentHash: current.hash,
          desiredHash,
        })
      }
      continue
    }

    if (!current) {
      items.push({ artifact, action: "create", reason: "destino nuevo", desiredHash })
    } else if (current.hash === desiredHash) {
      items.push({
        artifact,
        action: "adopt",
        reason: "contenido identico existente; se registrara sin reescribir",
        currentHash: current.hash,
        desiredHash,
      })
    } else if (force) {
      items.push({
        artifact,
        action: "update",
        reason: "conflicto externo aceptado con --force; se creara backup",
        currentHash: current.hash,
        desiredHash,
      })
    } else {
      items.push({
        artifact,
        action: "conflict",
        reason: "existe un archivo no administrado con contenido distinto",
        currentHash: current.hash,
        desiredHash,
      })
    }
  }

  const obsolete: ObsoletePlanItem[] = []
  for (const file of state.files) {
    const owners = owningTargets(file)
    const obsoleteTargets = owners.filter((target) => {
      const desired = desiredByTarget.get(target)
      return desired !== undefined && !desired.has(file.path)
    })
    if (obsoleteTargets.length === 0) continue

    const remainingTargets = owners.filter((target) => !obsoleteTargets.includes(target))
    if (remainingTargets.length > 0) {
      obsolete.push({
        file,
        action: "detach",
        obsoleteTargets,
        remainingTargets,
        reason: "la ruta ya no pertenece a esos targets, pero sigue compartida por otro",
      })
      continue
    }

    const current = await readExistingFile(file.path)
    if (current && current.hash !== file.afterHash) {
      obsolete.push({
        file,
        action: "skip",
        obsoleteTargets,
        remainingTargets,
        reason: "archivo obsoleto modificado despues de instalar; no se eliminara",
        currentHash: current.hash,
      })
      continue
    }

    obsolete.push({
      file,
      action: file.original.existed ? "restore" : "remove",
      obsoleteTargets,
      remainingTargets,
      reason: file.original.existed
        ? "artefacto obsoleto; se restaurara el archivo original"
        : "artefacto administrado obsoleto; se eliminara",
      ...(current ? { currentHash: current.hash } : {}),
    })
  }

  const location = stateLocation(context)
  return { items, obsolete, statePath: location.path, stateDir: location.directory }
}
