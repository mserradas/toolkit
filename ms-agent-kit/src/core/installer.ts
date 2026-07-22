import { mkdir, readFile, rm } from "node:fs/promises"
import path from "node:path"
import {
  atomicWriteFile,
  hashContent,
  readExistingFile,
  removeManagedFile,
  type ExistingFile,
} from "./files.js"
import {
  insertManagedBlock,
  inspectManagedBlock,
  ownedRange,
  removeManagedBlock,
  replaceManagedBlock,
  validateBlockId,
} from "./managed-block.js"
import { assertNoSymlinkEscape, assertPathWithin } from "./security.js"
import { backupPathFor, readState, stateLocation, writeState } from "./state.js"
import {
  owningTargets,
  type BuildContext,
  type InstallPlan,
  type InstallResult,
  type OriginalFile,
  type OwnedFile,
  type PlanItem,
  type Target,
  type UninstallResult,
} from "./types.js"

interface RollbackEntry {
  root: string
  path: string
  before: ExistingFile | null
  afterHash: string | null
  afterMode: number | null
}

function validateManagedOwnedFile(file: OwnedFile): void {
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
  if (file.strategy !== "managed-block") {
    throw new Error(`Estrategia de ownership desconocida en ${file.path}: ${file.strategy}`)
  }
  if (
    !file.blockId ||
    file.blockHash === undefined ||
    file.leadingSeparator === undefined ||
    file.createdFile === undefined
  ) {
    throw new Error(`Registro de bloque administrado inválido: ${file.path}`)
  }
  validateBlockId(file.blockId)
}

function validateManagedPlanItem(item: PlanItem): void {
  if (!item.strategy) {
    if (
      item.artifact.strategy !== undefined ||
      item.blockId !== undefined ||
      item.currentBlockHash !== undefined ||
      item.desiredBlockHash !== undefined ||
      item.leadingSeparator !== undefined ||
      item.satisfiedExternally !== undefined
    ) {
      throw new Error(`Plan de artefacto inválido sin estrategia: ${item.artifact.destination}`)
    }
    return
  }
  if (
    item.strategy !== "managed-block" ||
    item.artifact.strategy !== "managed-block" ||
    !item.blockId ||
    item.blockId !== item.artifact.blockId
  ) {
    throw new Error(`Plan de bloque administrado inválido: ${item.artifact.destination}`)
  }
  validateBlockId(item.blockId)
  if (item.action === "conflict") return
  if (item.satisfiedExternally) {
    if (item.action !== "unchanged") {
      throw new Error(`Un bloque satisfecho externamente no puede mutar: ${item.artifact.destination}`)
    }
    return
  }
  if (item.desiredBlockHash === undefined || item.leadingSeparator === undefined) {
    throw new Error(`Faltan hashes o separador del bloque administrado: ${item.artifact.destination}`)
  }
}

function sameSnapshot(current: ExistingFile | null, expectedHash?: string): boolean {
  if (!current) return expectedHash === undefined
  return current.hash === expectedHash
}

async function rollback(entries: RollbackEntry[]): Promise<void> {
  const errors: Error[] = []
  const blockedPaths = new Set<string>()
  for (const entry of [...entries].reverse()) {
    const resolvedPath = path.resolve(entry.path)
    if (blockedPaths.has(resolvedPath)) continue
    try {
      await assertNoSymlinkEscape(entry.root, entry.path)
      const current = await readExistingFile(entry.path)
      const unchangedSinceWrite = entry.afterHash === null
        ? current === null && entry.afterMode === null
        : current?.hash === entry.afterHash && current.mode === entry.afterMode
      if (!unchangedSinceWrite) {
        throw new Error(
          `No se revierte un destino editado después de escribirlo: ${entry.path}`,
        )
      }
      if (entry.before) {
        await atomicWriteFile(entry.root, entry.path, entry.before.content, entry.before.mode)
      } else {
        await removeManagedFile(entry.root, entry.path)
      }
    } catch (error) {
      errors.push(error as Error)
      blockedPaths.add(resolvedPath)
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, "Falló la reversión de la instalación")
}

async function createOriginal(
  stateDir: string,
  root: string,
  destination: string,
  current: ExistingFile | null,
): Promise<OriginalFile> {
  if (!current) return { existed: false }
  const backupPath = backupPathFor(stateDir, destination)
  await mkdir(path.dirname(backupPath), { recursive: true, mode: 0o700 })
  await atomicWriteFile(stateDir, backupPath, current.content, 0o600)
  return { existed: true, backupPath, mode: current.mode }
}

function composeManagedContent(item: PlanItem, current: ExistingFile | null): Buffer {
  const content = current?.content ?? Buffer.alloc(0)
  const inspection = inspectManagedBlock(content, item.blockId!)
  let result: Buffer
  if (inspection.status === "absent") {
    if (item.currentBlockHash !== undefined) {
      throw new Error(`El bloque esperado desapareció: ${item.artifact.destination}`)
    }
    result = insertManagedBlock(
      content,
      item.blockId!,
      item.artifact.content,
      item.leadingSeparator!,
    )
  } else if (inspection.status === "complete") {
    const currentBlock = ownedRange(content, inspection.range, item.leadingSeparator!)
    if (!currentBlock || currentBlock.hash !== item.currentBlockHash) {
      throw new Error(`El bloque cambió después del plan: ${item.artifact.destination}`)
    }
    result = replaceManagedBlock(
      content,
      inspection.range,
      item.blockId!,
      item.artifact.content,
      item.leadingSeparator!,
    )
  } else {
    throw new Error(`Los marcadores cambiaron después del plan: ${item.artifact.destination}`)
  }

  const resultInspection = inspectManagedBlock(result, item.blockId!)
  if (resultInspection.status !== "complete") {
    throw new Error(`No se pudo componer el bloque administrado: ${item.artifact.destination}`)
  }
  const resultBlock = ownedRange(result, resultInspection.range, item.leadingSeparator!)
  if (!resultBlock || resultBlock.hash !== item.desiredBlockHash) {
    throw new Error(`El hash compuesto del bloque no coincide: ${item.artifact.destination}`)
  }
  return result
}

function managedOwnedFile(
  item: PlanItem,
  previous: OwnedFile | undefined,
  current: ExistingFile | null,
  afterContent: Buffer,
  now: string,
): OwnedFile {
  const targets = [
    ...new Set([
      ...(previous ? owningTargets(previous) : []),
      ...owningTargets(item.artifact),
    ]),
  ]
  return {
    target: targets[0]!,
    targets,
    kind: item.artifact.kind,
    name: item.artifact.name,
    path: item.artifact.destination,
    root: item.artifact.root,
    afterHash: hashContent(afterContent),
    original:
      previous?.original ??
      (current
        ? { existed: true, mode: current.mode }
        : { existed: false }),
    installedAt: previous?.installedAt ?? now,
    strategy: "managed-block",
    blockId: item.blockId!,
    blockHash: item.desiredBlockHash!,
    leadingSeparator: item.leadingSeparator!,
    createdFile: previous?.createdFile ?? current === null,
  }
}

async function removeOwnedManagedBlock(
  file: OwnedFile,
  current: ExistingFile | null,
  rollbackEntries: RollbackEntry[],
): Promise<"absent" | "removed"> {
  if (!current) return "absent"
  const inspection = inspectManagedBlock(current.content, file.blockId!)
  if (inspection.status === "absent") return "absent"
  if (inspection.status !== "complete") {
    throw new Error(`Los marcadores del bloque administrado son ambiguos: ${file.path}`)
  }
  const block = ownedRange(current.content, inspection.range, file.leadingSeparator!)
  if (!block || block.hash !== file.blockHash) {
    throw new Error(`El bloque administrado cambió después del plan: ${file.path}`)
  }
  const remaining = removeManagedBlock(current.content, inspection.range, file.leadingSeparator!)
  if (remaining.length === 0 && file.createdFile) {
    await removeManagedFile(file.root, file.path)
    rollbackEntries.push({
      root: file.root,
      path: file.path,
      before: current,
      afterHash: null,
      afterMode: null,
    })
  } else {
    await atomicWriteFile(file.root, file.path, remaining, current.mode)
    rollbackEntries.push({
      root: file.root,
      path: file.path,
      before: current,
      afterHash: hashContent(remaining),
      afterMode: current.mode,
    })
  }
  return "removed"
}

export async function applyPlan(
  plan: InstallPlan,
  context: BuildContext,
): Promise<InstallResult> {
  for (const item of plan.items) validateManagedPlanItem(item)
  for (const obsolete of plan.obsolete) validateManagedOwnedFile(obsolete.file)
  const conflicts = plan.items.filter((item) => item.action === "conflict")
  if (conflicts.length > 0) {
    throw new Error(`La instalación tiene ${conflicts.length} conflicto(s); ejecuta \`plan\` o usa \`--force\``)
  }

  const state = await readState(context)
  for (const file of state.files) validateManagedOwnedFile(file)
  const files = new Map(state.files.map((file) => [file.path, file]))
  const rollbackEntries: RollbackEntry[] = []
  const now = new Date().toISOString()
  let created = 0
  let updated = 0
  let adopted = 0
  let unchanged = 0
  let removed = 0
  let restored = 0
  let detached = 0
  let skipped = 0
  const backupsToDelete: string[] = []

  try {
    for (const item of plan.items) {
      await assertNoSymlinkEscape(item.artifact.root, item.artifact.destination)
      const current = await readExistingFile(item.artifact.destination)
      if (!sameSnapshot(current, item.currentHash)) {
        throw new Error(`El destino cambió después del plan: ${item.artifact.destination}`)
      }

      const previous = files.get(item.artifact.destination)
      if (item.strategy === "managed-block") {
        if (item.satisfiedExternally) {
          files.delete(item.artifact.destination)
          unchanged += 1
          continue
        }

        if (item.action === "unchanged") {
          if (!current) {
            throw new Error(`El bloque administrado está ausente: ${item.artifact.destination}`)
          }
          const inspection = inspectManagedBlock(current.content, item.blockId!)
          if (inspection.status !== "complete") {
            throw new Error(`El bloque cambió después del plan: ${item.artifact.destination}`)
          }
          const block = ownedRange(current.content, inspection.range, item.leadingSeparator!)
          if (!block || block.hash !== item.desiredBlockHash) {
            throw new Error(`El bloque cambió después del plan: ${item.artifact.destination}`)
          }
          files.set(
            item.artifact.destination,
            managedOwnedFile(item, previous, current, current.content, now),
          )
          unchanged += 1
          continue
        }

        if (item.action !== "create" && item.action !== "update") {
          throw new Error(`Acción inválida para un bloque administrado: ${item.action}`)
        }
        const nextContent = composeManagedContent(item, current)
        const nextMode = current?.mode ?? item.artifact.mode
        await atomicWriteFile(
          item.artifact.root,
          item.artifact.destination,
          nextContent,
          nextMode,
        )
        rollbackEntries.push({
          root: item.artifact.root,
          path: item.artifact.destination,
          before: current,
          afterHash: hashContent(nextContent),
          afterMode: nextMode,
        })
        files.set(
          item.artifact.destination,
          managedOwnedFile(item, previous, current, nextContent, now),
        )
        if (item.action === "create") created += 1
        else updated += 1
        continue
      }

      if (item.action === "unchanged") {
        if (previous) {
          const targets = [...new Set([...owningTargets(previous), ...owningTargets(item.artifact)])]
          files.set(previous.path, {
            ...previous,
            target: targets[0]!,
            targets,
            kind: item.artifact.kind,
            name: item.artifact.name,
            root: item.artifact.root,
            afterHash: item.desiredHash,
          })
        }
        unchanged += 1
        continue
      }

      const preserveOriginal =
        previous && (!current || current.hash === previous.afterHash)
          ? previous.original
          : await createOriginal(
              plan.stateDir,
              item.artifact.root,
              item.artifact.destination,
              current,
            )

      if (item.action === "adopt") {
        adopted += 1
      } else {
        const nextMode = current?.mode ?? item.artifact.mode
        await atomicWriteFile(
          item.artifact.root,
          item.artifact.destination,
          item.artifact.content,
          nextMode,
        )
        rollbackEntries.push({
          root: item.artifact.root,
          path: item.artifact.destination,
          before: current,
          afterHash: item.desiredHash,
          afterMode: nextMode,
        })
        if (item.action === "create") created += 1
        else updated += 1
      }

      const targets = [
        ...new Set([
          ...(previous ? owningTargets(previous) : []),
          ...owningTargets(item.artifact),
        ]),
      ]
      const owned: OwnedFile = {
        target: targets[0]!,
        targets,
        kind: item.artifact.kind,
        name: item.artifact.name,
        path: item.artifact.destination,
        root: item.artifact.root,
        afterHash: item.desiredHash,
        original: preserveOriginal,
        installedAt: previous?.installedAt ?? now,
      }
      files.set(owned.path, owned)
    }

    for (const obsolete of plan.obsolete) {
      const currentOwned = files.get(obsolete.file.path) ?? obsolete.file
      if (obsolete.action === "detach") {
        const targets = owningTargets(currentOwned).filter(
          (target) => !obsolete.obsoleteTargets.includes(target),
        )
        if (targets.length > 0) {
          files.set(currentOwned.path, { ...currentOwned, target: targets[0]!, targets })
        } else {
          files.delete(currentOwned.path)
        }
        detached += 1
        continue
      }
      if (obsolete.action === "skip") {
        skipped += 1
        continue
      }

      assertPathWithin(obsolete.file.root, obsolete.file.path)
      await assertNoSymlinkEscape(obsolete.file.root, obsolete.file.path)
      const current = await readExistingFile(obsolete.file.path)
      if (!sameSnapshot(current, obsolete.currentHash)) {
        throw new Error(`El destino cambió después del plan: ${obsolete.file.path}`)
      }
      if (obsolete.file.strategy === "managed-block") {
        await removeOwnedManagedBlock(obsolete.file, current, rollbackEntries)
        removed += 1
        files.delete(obsolete.file.path)
        continue
      }
      if (obsolete.action === "restore") {
        if (!obsolete.file.original.backupPath) {
          throw new Error(`Falta la ruta de la copia de seguridad original: ${obsolete.file.path}`)
        }
        assertPathWithin(plan.stateDir, obsolete.file.original.backupPath)
        const backup = await readFile(obsolete.file.original.backupPath)
        const restoredMode = obsolete.file.original.mode ?? 0o644
        await atomicWriteFile(
          obsolete.file.root,
          obsolete.file.path,
          backup,
          restoredMode,
        )
        rollbackEntries.push({
          root: obsolete.file.root,
          path: obsolete.file.path,
          before: current,
          afterHash: hashContent(backup),
          afterMode: restoredMode,
        })
        backupsToDelete.push(obsolete.file.original.backupPath)
        restored += 1
      } else {
        await removeManagedFile(obsolete.file.root, obsolete.file.path)
        rollbackEntries.push({
          root: obsolete.file.root,
          path: obsolete.file.path,
          before: current,
          afterHash: null,
          afterMode: null,
        })
        removed += 1
      }
      files.delete(obsolete.file.path)
    }

    await writeState(context, {
      schemaVersion: 1,
      scope: context.scope,
      root: context.scope === "user" ? context.homeDir : context.projectRoot,
      files: [...files.values()].sort((left, right) => left.path.localeCompare(right.path)),
      updatedAt: now,
    })
  } catch (error) {
    try {
      await rollback(rollbackEntries)
    } catch (rollbackError) {
      throw new AggregateError([error as Error, rollbackError as Error], "Fallaron la instalación y la reversión")
    }
    throw error
  }

  for (const backup of backupsToDelete) {
    await rm(backup, { force: true })
  }

  return {
    created,
    updated,
    adopted,
    unchanged,
    removed,
    restored,
    detached,
    skipped,
    statePath: plan.statePath,
  }
}

export async function uninstallTargets(
  targets: Target[],
  context: BuildContext,
): Promise<UninstallResult> {
  const state = await readState(context)
  for (const file of state.files) validateManagedOwnedFile(file)
  const selected = new Set(targets)
  const keep: OwnedFile[] = []
  const restored: string[] = []
  const removed: string[] = []
  const skipped: Array<{ path: string; reason: string }> = []
  const rollbackEntries: RollbackEntry[] = []
  const backupsToDelete: string[] = []

  try {
    for (const file of state.files) {
      const owners = owningTargets(file)
      if (!owners.some((target) => selected.has(target))) {
        keep.push(file)
        continue
      }

      const remainingTargets = owners.filter((target) => !selected.has(target))
      if (remainingTargets.length > 0) {
        keep.push({
          ...file,
          target: remainingTargets[0]!,
          targets: remainingTargets,
        })
        continue
      }

      assertPathWithin(file.root, file.path)
      await assertNoSymlinkEscape(file.root, file.path)
      const current = await readExistingFile(file.path)
      if (file.strategy === "managed-block") {
        if (!current) {
          removed.push(file.path)
          continue
        }
        const inspection = inspectManagedBlock(current.content, file.blockId!)
        if (inspection.status === "absent") {
          removed.push(file.path)
          continue
        }
        if (inspection.status !== "complete") {
          skipped.push({ path: file.path, reason: "marcadores ambiguos después de instalar" })
          keep.push(file)
          continue
        }
        const block = ownedRange(current.content, inspection.range, file.leadingSeparator!)
        if (!block || block.hash !== file.blockHash) {
          skipped.push({ path: file.path, reason: "modificado después de instalar" })
          keep.push(file)
          continue
        }
        await removeOwnedManagedBlock(file, current, rollbackEntries)
        removed.push(file.path)
        continue
      }
      if (current && current.hash !== file.afterHash) {
        skipped.push({ path: file.path, reason: "modificado después de instalar" })
        keep.push(file)
        continue
      }

      if (file.original.existed) {
        if (!file.original.backupPath) {
          skipped.push({ path: file.path, reason: "falta la ruta de la copia de seguridad original" })
          keep.push(file)
          continue
        }
        assertPathWithin(stateLocation(context).directory, file.original.backupPath)
        let backup: Buffer
        try {
          backup = await readFile(file.original.backupPath)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            skipped.push({ path: file.path, reason: "copia de seguridad original ausente" })
            keep.push(file)
            continue
          }
          throw error
        }
        const restoredMode = file.original.mode ?? 0o644
        await atomicWriteFile(file.root, file.path, backup, restoredMode)
        rollbackEntries.push({
          root: file.root,
          path: file.path,
          before: current,
          afterHash: hashContent(backup),
          afterMode: restoredMode,
        })
        backupsToDelete.push(file.original.backupPath)
        restored.push(file.path)
      } else {
        await removeManagedFile(file.root, file.path)
        rollbackEntries.push({
          root: file.root,
          path: file.path,
          before: current,
          afterHash: null,
          afterMode: null,
        })
        removed.push(file.path)
      }
    }

    await writeState(context, {
      ...state,
      files: keep,
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    try {
      await rollback(rollbackEntries)
    } catch (rollbackError) {
      throw new AggregateError([error as Error, rollbackError as Error], "Fallaron la desinstalación y la reversión")
    }
    throw error
  }

  for (const backup of backupsToDelete) {
    await rm(backup, { force: true })
  }

  return { restored, removed, skipped, statePath: stateLocation(context).path }
}

export async function installationStatus(
  targets: Target[],
  context: BuildContext,
): Promise<Array<{ target: Target; path: string; status: "ok" | "modified" | "missing" }>> {
  const state = await readState(context)
  const selected = new Set(targets)
  const output: Array<{
    target: Target
    path: string
    status: "ok" | "modified" | "missing"
  }> = []

  for (const file of state.files) {
    validateManagedOwnedFile(file)
    const owners = owningTargets(file)
    await assertNoSymlinkEscape(file.root, file.path)
    const current = await readExistingFile(file.path)
    for (const target of owners) {
      if (!selected.has(target)) continue
      let status: "ok" | "modified" | "missing"
      if (!current) {
        status = "missing"
      } else if (file.strategy === "managed-block") {
        const inspection = inspectManagedBlock(current.content, file.blockId!)
        if (inspection.status === "absent") {
          status = "missing"
        } else if (inspection.status !== "complete") {
          status = "modified"
        } else {
          const block = ownedRange(current.content, inspection.range, file.leadingSeparator!)
          status = block?.hash === file.blockHash ? "ok" : "modified"
        }
      } else {
        status = current.hash === file.afterHash ? "ok" : "modified"
      }
      output.push({ target, path: file.path, status })
    }
  }
  return output.sort((left, right) => left.path.localeCompare(right.path))
}
