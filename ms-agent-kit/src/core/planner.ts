import { hashContent, readExistingFile, type ExistingFile } from "./files.js"
import {
  chooseLeadingSeparator,
  inspectExternalCodexContext7,
  inspectManagedBlock,
  ownedRange,
  renderManagedBlock,
  validateBlockId,
  type LeadingSeparator,
} from "./managed-block.js"
import { assertNoSymlinkEscape } from "./security.js"
import { readState, stateLocation } from "./state.js"
import {
  owningTargets,
  type Artifact,
  type BuildContext,
  type InstallPlan,
  type ObsoletePlanItem,
  type OwnedFile,
  type PlanItem,
  type Target,
} from "./types.js"

function validateArtifact(artifact: Artifact): void {
  if (!artifact.strategy) {
    if (artifact.blockId !== undefined || artifact.satisfaction !== undefined) {
      throw new Error(`Definición de artefacto inválida sin estrategia: ${artifact.destination}`)
    }
    return
  }
  if (artifact.strategy !== "managed-block" || !artifact.blockId) {
    throw new Error(`Definición de bloque administrado inválida: ${artifact.destination}`)
  }
  validateBlockId(artifact.blockId)
}

function validateOwnedFile(file: OwnedFile): void {
  if (!file.strategy) {
    if (
      file.blockId !== undefined ||
      file.blockHash !== undefined ||
      file.leadingSeparator !== undefined ||
      file.createdFile !== undefined
    ) {
      throw new Error(`Registro de archivo inválido sin estrategia: ${file.path}`)
    }
    return
  }
  if (
    file.strategy !== "managed-block" ||
    !file.blockId ||
    file.blockHash === undefined ||
    file.leadingSeparator === undefined ||
    file.createdFile === undefined
  ) {
    throw new Error(`Registro de bloque administrado inválido: ${file.path}`)
  }
  validateBlockId(file.blockId)
}

function externalSatisfaction(
  artifact: Artifact,
  content: Buffer,
  excludedRange?: { markerStart: number; markerEnd: number },
): "absent" | "satisfied" | "conflict" {
  return artifact.satisfaction === "codex-context7"
    ? inspectExternalCodexContext7(content, excludedRange)
    : "absent"
}

function managedPlanItem(
  artifact: Artifact,
  current: ExistingFile | null,
  previous: OwnedFile | undefined,
  desiredHash: string,
  force: boolean,
): PlanItem {
  const blockId = artifact.blockId!
  const common = {
    artifact,
    strategy: "managed-block" as const,
    blockId,
    desiredHash,
    ...(current ? { currentHash: current.hash } : {}),
  }
  const previousBlock = previous?.strategy === "managed-block" ? previous : undefined
  if (previousBlock && previousBlock.blockId !== blockId) {
    throw new Error(`El identificador del bloque administrado cambió: ${artifact.destination}`)
  }
  if (previous && !previousBlock) {
    throw new Error(`La estrategia de ownership cambió para ${artifact.destination}`)
  }

  const inspection = inspectManagedBlock(current?.content ?? Buffer.alloc(0), blockId)
  if (inspection.status !== "absent" && inspection.status !== "complete") {
    return {
      ...common,
      action: "conflict",
      reason: `marcadores de bloque administrado ambiguos (${inspection.status})`,
    }
  }

  if (inspection.status === "complete") {
    const external = externalSatisfaction(artifact, current!.content, inspection.range)
    if (external !== "absent") {
      return {
        ...common,
        action: "conflict",
        reason: "existe una tabla externa adicional junto al bloque administrado",
      }
    }

    const leadingSeparator = (previousBlock?.leadingSeparator ?? "") as LeadingSeparator
    const currentBlock = ownedRange(current!.content, inspection.range, leadingSeparator)
    if (!currentBlock) {
      return {
        ...common,
        action: "conflict",
        reason: "el separador poseído del bloque administrado cambió",
      }
    }
    const desiredBlockHash = hashContent(
      renderManagedBlock(blockId, artifact.content, leadingSeparator),
    )
    if (currentBlock.hash === desiredBlockHash) {
      return {
        ...common,
        action: "unchanged",
        reason: "el bloque administrado ya está actualizado",
        currentBlockHash: currentBlock.hash,
        desiredBlockHash,
        leadingSeparator,
      }
    }
    if (previousBlock && currentBlock.hash === previousBlock.blockHash) {
      return {
        ...common,
        action: "update",
        reason: "actualización segura del bloque administrado",
        currentBlockHash: currentBlock.hash,
        desiredBlockHash,
        leadingSeparator,
      }
    }
    return {
      ...common,
      action: force ? "update" : "conflict",
      reason: force
        ? "bloque administrado modificado; `--force` restaurará solo ese bloque"
        : "el bloque administrado cambió desde la última instalación",
      currentBlockHash: currentBlock.hash,
      desiredBlockHash,
      leadingSeparator,
    }
  }

  const external = externalSatisfaction(artifact, current?.content ?? Buffer.alloc(0))
  if (external === "satisfied") {
    return {
      ...common,
      action: "unchanged",
      reason: "una tabla externa equivalente satisface la configuración",
      satisfiedExternally: true,
    }
  }
  if (external === "conflict") {
    return {
      ...common,
      action: "conflict",
      reason: "una tabla externa de Context7 está protegida y no es equivalente",
    }
  }

  const leadingSeparator = chooseLeadingSeparator(current?.content ?? Buffer.alloc(0))
  const desiredBlockHash = hashContent(
    renderManagedBlock(blockId, artifact.content, leadingSeparator),
  )
  return {
    ...common,
    action: current ? "update" : "create",
    reason: previousBlock
      ? "el bloque administrado está ausente; se reinsertará"
      : current
        ? "se insertará el bloque administrado preservando el archivo existente"
        : "destino nuevo para el bloque administrado",
    desiredBlockHash,
    leadingSeparator,
  }
}

async function planManagedObsolete(
  file: OwnedFile,
  obsoleteTargets: Target[],
  remainingTargets: Target[],
): Promise<ObsoletePlanItem> {
  const common = { file, obsoleteTargets, remainingTargets }
  let current: ExistingFile | null
  try {
    await assertNoSymlinkEscape(file.root, file.path)
    current = await readExistingFile(file.path)
  } catch (error) {
    return {
      ...common,
      action: "skip",
      reason: `destino obsoleto no seguro: ${(error as Error).message}`,
    }
  }
  if (!current) {
    return {
      ...common,
      action: "remove",
      reason: "bloque obsoleto ausente; se limpiará el estado",
    }
  }

  const inspection = inspectManagedBlock(current.content, file.blockId!)
  if (inspection.status === "absent") {
    return {
      ...common,
      action: "remove",
      reason: "bloque obsoleto ausente; se limpiará el estado",
      currentHash: current.hash,
    }
  }
  if (inspection.status !== "complete") {
    return {
      ...common,
      action: "skip",
      reason: "marcadores del bloque obsoleto ambiguos; no se retirará",
      currentHash: current.hash,
    }
  }
  const block = ownedRange(current.content, inspection.range, file.leadingSeparator!)
  if (!block || block.hash !== file.blockHash) {
    return {
      ...common,
      action: "skip",
      reason: "bloque obsoleto modificado después de instalar; no se retirará",
      currentHash: current.hash,
    }
  }
  return {
    ...common,
    action: "remove",
    reason: "bloque administrado obsoleto; se retirará solo su rango",
    currentHash: current.hash,
  }
}

export async function createPlan(
  artifacts: Artifact[],
  context: BuildContext,
  force = false,
): Promise<InstallPlan> {
  const state = await readState(context)
  for (const artifact of artifacts) validateArtifact(artifact)
  for (const file of state.files) validateOwnedFile(file)

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
    let current: ExistingFile | null
    try {
      await assertNoSymlinkEscape(artifact.root, artifact.destination)
      current = await readExistingFile(artifact.destination)
    } catch (error) {
      items.push({
        artifact,
        action: "conflict",
        reason: `destino no seguro: ${(error as Error).message}`,
        desiredHash,
        ...(artifact.strategy ? { strategy: artifact.strategy, blockId: artifact.blockId } : {}),
      })
      continue
    }
    const previous = owned.get(artifact.destination)

    if (artifact.strategy === "managed-block") {
      items.push(managedPlanItem(artifact, current, previous, desiredHash, force))
      continue
    }

    if (previous) {
      if (!current) {
        items.push({
          artifact,
          action: "update",
          reason: "archivo administrado ausente; se recreará",
          desiredHash,
        })
      } else if (current.hash === desiredHash) {
        items.push({
          artifact,
          action: "unchanged",
          reason: "ya está actualizado",
          currentHash: current.hash,
          desiredHash,
        })
      } else if (current.hash === previous.afterHash) {
        items.push({
          artifact,
          action: "update",
          reason: "actualización segura de un archivo administrado",
          currentHash: current.hash,
          desiredHash,
        })
      } else if (force) {
        items.push({
          artifact,
          action: "update",
          reason: "archivo administrado modificado; `--force` adopta la versión actual como copia de seguridad",
          currentHash: current.hash,
          desiredHash,
        })
      } else {
        items.push({
          artifact,
          action: "conflict",
          reason: "el archivo cambió desde la última instalación",
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
        reason: "contenido idéntico existente; se registrará sin reescribir",
        currentHash: current.hash,
        desiredHash,
      })
    } else if (force) {
      items.push({
        artifact,
        action: "update",
        reason: "conflicto externo aceptado con `--force`; se creará una copia de seguridad",
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
        reason: "la ruta ya no pertenece a esos clientes, pero sigue compartida por otro",
      })
      continue
    }

    if (file.strategy === "managed-block") {
      obsolete.push(await planManagedObsolete(file, obsoleteTargets, remainingTargets))
      continue
    }

    const current = await readExistingFile(file.path)
    if (current && current.hash !== file.afterHash) {
      obsolete.push({
        file,
        action: "skip",
        obsoleteTargets,
        remainingTargets,
        reason: "archivo obsoleto modificado después de instalar; no se eliminará",
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
        ? "artefacto obsoleto; se restaurará el archivo original"
        : "artefacto administrado obsoleto; se eliminará",
      ...(current ? { currentHash: current.hash } : {}),
    })
  }

  const location = stateLocation(context)
  return { items, obsolete, statePath: location.path, stateDir: location.directory }
}
