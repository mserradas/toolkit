import path from "node:path"
import { AppError } from "./errors.js"
import { hashContent } from "./files.js"
import { validateBlockId } from "./managed-block.js"
import {
  TARGETS,
  type ArtifactKind,
  type BuildContext,
  type InstallState,
  type OwnedFile,
  type OriginalFile,
  type Target,
} from "./types.js"

const ARTIFACT_KINDS = new Set<ArtifactKind>([
  "agent",
  "command",
  "configuration",
  "skill",
  "documentation",
  "plugin",
  "policy",
])
const HASH_PATTERN = /^[a-f0-9]{64}$/
const STATE_KEYS = new Set(["schemaVersion", "scope", "root", "files", "updatedAt"])
const FILE_KEYS = new Set([
  "target",
  "targets",
  "kind",
  "name",
  "path",
  "root",
  "afterHash",
  "original",
  "installedAt",
  "strategy",
  "blockId",
  "blockHash",
  "leadingSeparator",
  "createdFile",
])
const ORIGINAL_KEYS = new Set(["existed", "backupPath", "mode"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function invalid(statePath: string, reason: string): never {
  throw new AppError(
    "STATE_INVALID",
    `Estado incompatible en ${statePath}: ${reason}`,
    4,
    { statePath, reason },
  )
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  statePath: string,
  label: string,
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key))
  if (unknown.length > 0) invalid(statePath, `${label} contiene campos desconocidos: ${unknown.join(", ")}`)
}

function requiredString(
  value: unknown,
  statePath: string,
  label: string,
): string {
  if (typeof value !== "string" || value.length === 0) invalid(statePath, `${label} no es un texto válido`)
  return value
}

function isoTimestamp(value: unknown, statePath: string, label: string): string {
  const text = requiredString(value, statePath, label)
  try {
    if (new Date(text).toISOString() !== text) invalid(statePath, `${label} no es un timestamp ISO`)
  } catch {
    invalid(statePath, `${label} no es un timestamp ISO`)
  }
  return text
}

function absolutePath(value: unknown, statePath: string, label: string): string {
  const text = requiredString(value, statePath, label)
  if (!path.isAbsolute(text) || path.resolve(text) !== text) {
    invalid(statePath, `${label} no es una ruta absoluta normalizada`)
  }
  return text
}

function isWithin(root: string, destination: string, allowRoot: boolean): boolean {
  const relative = path.relative(root, destination)
  if (relative === "") return allowRoot
  return (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

function hash(value: unknown, statePath: string, label: string): string {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
    invalid(statePath, `${label} no es un SHA-256 válido`)
  }
  return value
}

function fileMode(value: unknown, statePath: string, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 0o777) {
    invalid(statePath, `${label} no es un modo de archivo válido`)
  }
  return Number(value)
}

function target(value: unknown, statePath: string, label: string): Target {
  if (typeof value !== "string" || !TARGETS.includes(value as Target)) {
    invalid(statePath, `${label} no es un cliente válido`)
  }
  return value as Target
}

function originalFile(
  value: unknown,
  statePath: string,
  stateDirectory: string,
  destination: string,
  label: string,
): OriginalFile {
  if (!isRecord(value)) invalid(statePath, `${label} no es un objeto`)
  rejectUnknownKeys(value, ORIGINAL_KEYS, statePath, label)
  if (typeof value.existed !== "boolean") invalid(statePath, `${label}.existed no es booleano`)

  const backupPath =
    value.backupPath === undefined
      ? undefined
      : absolutePath(value.backupPath, statePath, `${label}.backupPath`)
  if (backupPath && !isWithin(stateDirectory, backupPath, false)) {
    invalid(statePath, `${label}.backupPath escapa del directorio de estado`)
  }
  const expectedBackupPath = path.join(
    stateDirectory,
    "backups",
    `${hashContent(destination)}.before`,
  )
  if (backupPath && backupPath !== expectedBackupPath) {
    invalid(statePath, `${label}.backupPath no corresponde al destino administrado`)
  }
  const mode =
    value.mode === undefined ? undefined : fileMode(value.mode, statePath, `${label}.mode`)
  if (!value.existed && (backupPath !== undefined || mode !== undefined)) {
    invalid(statePath, `${label} conserva metadata para un archivo que no existía`)
  }
  return {
    existed: value.existed,
    ...(backupPath === undefined ? {} : { backupPath }),
    ...(mode === undefined ? {} : { mode }),
  }
}

function ownershipFields(
  value: Record<string, unknown>,
  statePath: string,
  label: string,
): Pick<OwnedFile, "strategy" | "blockId" | "blockHash" | "leadingSeparator" | "createdFile"> {
  if (value.strategy === undefined) {
    if (
      value.blockId !== undefined ||
      value.blockHash !== undefined ||
      value.leadingSeparator !== undefined ||
      value.createdFile !== undefined
    ) {
      invalid(statePath, `${label} declara campos de bloque sin estrategia`)
    }
    return {}
  }
  if (value.strategy !== "managed-block") {
    invalid(statePath, `${label} declara una estrategia desconocida: ${String(value.strategy)}`)
  }
  const blockId = requiredString(value.blockId, statePath, `${label}.blockId`)
  try {
    validateBlockId(blockId)
  } catch (error) {
    invalid(statePath, (error as Error).message)
  }
  const blockHash = hash(value.blockHash, statePath, `${label}.blockHash`)
  if (value.leadingSeparator !== "" && value.leadingSeparator !== "\n" && value.leadingSeparator !== "\r\n") {
    invalid(statePath, `${label}.leadingSeparator no es válido`)
  }
  if (typeof value.createdFile !== "boolean") {
    invalid(statePath, `${label}.createdFile no es booleano`)
  }
  return {
    strategy: "managed-block",
    blockId,
    blockHash,
    leadingSeparator: value.leadingSeparator,
    createdFile: value.createdFile,
  }
}

function ownedFile(
  value: unknown,
  contextRoot: string,
  statePath: string,
  stateDirectory: string,
  index: number,
): OwnedFile {
  const label = `files[${index}]`
  if (!isRecord(value)) invalid(statePath, `${label} no es un objeto`)
  rejectUnknownKeys(value, FILE_KEYS, statePath, label)

  const primaryTarget = target(value.target, statePath, `${label}.target`)
  let targets: Target[] | undefined
  if (value.targets !== undefined) {
    if (!Array.isArray(value.targets) || value.targets.length === 0) {
      invalid(statePath, `${label}.targets no es una lista no vacía`)
    }
    targets = value.targets.map((item, targetIndex) =>
      target(item, statePath, `${label}.targets[${targetIndex}]`),
    )
    if (new Set(targets).size !== targets.length || targets[0] !== primaryTarget) {
      invalid(statePath, `${label}.targets debe ser único y comenzar por target`)
    }
  }

  if (typeof value.kind !== "string" || !ARTIFACT_KINDS.has(value.kind as ArtifactKind)) {
    invalid(statePath, `${label}.kind no es válido`)
  }
  const name = requiredString(value.name, statePath, `${label}.name`)
  const root = absolutePath(value.root, statePath, `${label}.root`)
  const destination = absolutePath(value.path, statePath, `${label}.path`)
  if (!isWithin(contextRoot, root, true)) invalid(statePath, `${label}.root escapa del alcance`)
  if (!isWithin(root, destination, false)) invalid(statePath, `${label}.path escapa de su raíz`)

  const ownership = ownershipFields(value, statePath, label)
  return {
    target: primaryTarget,
    ...(targets === undefined ? {} : { targets }),
    kind: value.kind as ArtifactKind,
    name,
    path: destination,
    root,
    afterHash: hash(value.afterHash, statePath, `${label}.afterHash`),
    original: originalFile(
      value.original,
      statePath,
      stateDirectory,
      destination,
      `${label}.original`,
    ),
    installedAt: isoTimestamp(value.installedAt, statePath, `${label}.installedAt`),
    ...ownership,
  }
}

export function parseInstallState(
  value: unknown,
  context: BuildContext,
  statePath: string,
): InstallState {
  if (!isRecord(value)) invalid(statePath, "la raíz no es un objeto")
  rejectUnknownKeys(value, STATE_KEYS, statePath, "state")
  if (value.schemaVersion !== 1) invalid(statePath, "schemaVersion no es compatible")
  if (value.scope !== context.scope) invalid(statePath, "el alcance no coincide")

  const expectedRoot = path.resolve(context.scope === "user" ? context.homeDir : context.projectRoot)
  const root = absolutePath(value.root, statePath, "root")
  if (root !== expectedRoot) invalid(statePath, "root no coincide con el alcance solicitado")
  if (!Array.isArray(value.files)) invalid(statePath, "files no es una lista")

  const stateDirectory = path.dirname(statePath)
  const files = value.files.map((file, index) =>
    ownedFile(file, expectedRoot, statePath, stateDirectory, index),
  )
  if (new Set(files.map((file) => file.path)).size !== files.length) {
    invalid(statePath, "files contiene destinos duplicados")
  }

  return {
    schemaVersion: 1,
    scope: context.scope,
    root,
    files,
    updatedAt: isoTimestamp(value.updatedAt, statePath, "updatedAt"),
  }
}
