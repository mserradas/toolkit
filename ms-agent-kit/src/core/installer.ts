import { mkdir, readFile, rm } from "node:fs/promises"
import path from "node:path"
import {
  atomicWriteFile,
  hashContent,
  readExistingFile,
  removeManagedFile,
  type ExistingFile,
} from "./files.js"
import { assertPathWithin } from "./security.js"
import { backupPathFor, readState, stateLocation, writeState } from "./state.js"
import {
  owningTargets,
  type BuildContext,
  type InstallPlan,
  type InstallResult,
  type OriginalFile,
  type OwnedFile,
  type Target,
  type UninstallResult,
} from "./types.js"

interface RollbackEntry {
  root: string
  path: string
  before: ExistingFile | null
}

function sameSnapshot(current: ExistingFile | null, expectedHash?: string): boolean {
  if (!current) return expectedHash === undefined
  return current.hash === expectedHash
}

async function rollback(entries: RollbackEntry[]): Promise<void> {
  const errors: Error[] = []
  for (const entry of [...entries].reverse()) {
    try {
      if (entry.before) {
        await atomicWriteFile(entry.root, entry.path, entry.before.content, entry.before.mode)
      } else {
        await removeManagedFile(entry.root, entry.path)
      }
    } catch (error) {
      errors.push(error as Error)
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, "Fallo el rollback de la instalacion")
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

export async function applyPlan(
  plan: InstallPlan,
  context: BuildContext,
): Promise<InstallResult> {
  const conflicts = plan.items.filter((item) => item.action === "conflict")
  if (conflicts.length > 0) {
    throw new Error(`La instalacion tiene ${conflicts.length} conflicto(s); ejecuta plan o usa --force`)
  }

  const state = await readState(context)
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
      const current = await readExistingFile(item.artifact.destination)
      if (!sameSnapshot(current, item.currentHash)) {
        throw new Error(`El destino cambio despues del plan: ${item.artifact.destination}`)
      }

      const previous = files.get(item.artifact.destination)
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
        await atomicWriteFile(
          item.artifact.root,
          item.artifact.destination,
          item.artifact.content,
          current?.mode ?? item.artifact.mode,
        )
        rollbackEntries.push({
          root: item.artifact.root,
          path: item.artifact.destination,
          before: current,
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
      const current = await readExistingFile(obsolete.file.path)
      if (!sameSnapshot(current, obsolete.currentHash)) {
        throw new Error(`El destino cambio despues del plan: ${obsolete.file.path}`)
      }
      rollbackEntries.push({
        root: obsolete.file.root,
        path: obsolete.file.path,
        before: current,
      })
      if (obsolete.action === "restore") {
        if (!obsolete.file.original.backupPath) {
          throw new Error(`Falta la ruta del backup original: ${obsolete.file.path}`)
        }
        assertPathWithin(plan.stateDir, obsolete.file.original.backupPath)
        const backup = await readFile(obsolete.file.original.backupPath)
        await atomicWriteFile(
          obsolete.file.root,
          obsolete.file.path,
          backup,
          obsolete.file.original.mode ?? 0o644,
        )
        backupsToDelete.push(obsolete.file.original.backupPath)
        restored += 1
      } else {
        await removeManagedFile(obsolete.file.root, obsolete.file.path)
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
      throw new AggregateError([error as Error, rollbackError as Error], "Instalacion y rollback fallaron")
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
      const current = await readExistingFile(file.path)
      if (current && current.hash !== file.afterHash) {
        skipped.push({ path: file.path, reason: "modificado despues de instalar" })
        keep.push(file)
        continue
      }

      rollbackEntries.push({ root: file.root, path: file.path, before: current })
      if (file.original.existed) {
        if (!file.original.backupPath) {
          skipped.push({ path: file.path, reason: "falta la ruta del backup original" })
          keep.push(file)
          rollbackEntries.pop()
          continue
        }
        assertPathWithin(stateLocation(context).directory, file.original.backupPath)
        let backup: Buffer
        try {
          backup = await readFile(file.original.backupPath)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            skipped.push({ path: file.path, reason: "backup original ausente" })
            keep.push(file)
            rollbackEntries.pop()
            continue
          }
          throw error
        }
        await atomicWriteFile(file.root, file.path, backup, file.original.mode ?? 0o644)
        backupsToDelete.push(file.original.backupPath)
        restored.push(file.path)
      } else {
        await removeManagedFile(file.root, file.path)
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
      throw new AggregateError([error as Error, rollbackError as Error], "Desinstalacion y rollback fallaron")
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
    const owners = owningTargets(file)
    const current = await readExistingFile(file.path)
    for (const target of owners) {
      if (!selected.has(target)) continue
      output.push({
        target,
        path: file.path,
        status: !current ? "missing" : current.hash === file.afterHash ? "ok" : "modified",
      })
    }
  }
  return output.sort((left, right) => left.path.localeCompare(right.path))
}
