import { randomUUID } from "node:crypto"
import { mkdir, open, readFile, rm, rmdir } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { AppError, throwIfAborted } from "./errors.js"
import { assertSafeStatePath, stateLocation } from "./state.js"
import type { BuildContext } from "./types.js"

export type MutableOperation = "install" | "uninstall"

interface LockMetadata {
  pid: number
  operation: MutableOperation
  startedAt: string
  token: string
}

export interface OperationLock {
  path: string
  release(): Promise<void>
}

export function operationLockPath(context: BuildContext): string {
  return path.join(stateLocation(context).directory, "operation.lock")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseLockMetadata(value: unknown): LockMetadata | null {
  if (!isRecord(value)) return null
  if (!Number.isSafeInteger(value.pid) || Number(value.pid) <= 0) return null
  if (value.operation !== "install" && value.operation !== "uninstall") return null
  if (typeof value.startedAt !== "string") return null
  try {
    if (new Date(value.startedAt).toISOString() !== value.startedAt) return null
  } catch {
    return null
  }
  if (typeof value.token !== "string" || value.token.length === 0) return null
  return {
    pid: Number(value.pid),
    operation: value.operation,
    startedAt: value.startedAt,
    token: value.token,
  }
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ESRCH") return false
    if (code === "EPERM") return true
    throw error
  }
}

async function existingLock(lockPath: string): Promise<LockMetadata | null | "missing"> {
  try {
    const parsed = JSON.parse(await readFile(lockPath, "utf8")) as unknown
    return parseLockMetadata(parsed)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing"
    if (error instanceof SyntaxError) return null
    throw error
  }
}

async function releaseOwnedLock(
  lockPath: string,
  directory: string,
  token: string,
  removeDirectory: boolean,
): Promise<void> {
  try {
    const metadata = await existingLock(lockPath)
    if (metadata !== "missing" && metadata?.token === token) {
      await rm(lockPath, { force: true })
    }
  } finally {
    if (removeDirectory) {
      try {
        await rmdir(directory)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== "ENOENT" && code !== "ENOTEMPTY" && code !== "EEXIST") throw error
      }
    }
  }
}

export async function acquireOperationLock(
  context: BuildContext,
  operation: MutableOperation,
  signal?: AbortSignal,
): Promise<OperationLock> {
  throwIfAborted(signal)
  const directory = stateLocation(context).directory
  const lockPath = operationLockPath(context)
  await assertSafeStatePath(context, lockPath)
  let createdDirectory = false

  try {
    createdDirectory = (await mkdir(directory, { recursive: true, mode: 0o700 })) !== undefined
    await assertSafeStatePath(context, lockPath)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      throwIfAborted(signal)
      const metadata: LockMetadata = {
        pid: process.pid,
        operation,
        startedAt: new Date().toISOString(),
        token: randomUUID(),
      }

      let handle
      try {
        handle = await open(lockPath, "wx", 0o600)
        await handle.writeFile(`${JSON.stringify(metadata, null, 2)}\n`, "utf8")
        await handle.sync()
        await handle.close()
        handle = undefined
        return {
          path: lockPath,
          release: () =>
            releaseOwnedLock(lockPath, directory, metadata.token, createdDirectory),
        }
      } catch (error) {
        await handle?.close().catch(() => undefined)
        const code = (error as NodeJS.ErrnoException).code
        if (code !== "EEXIST") {
          if (handle) await rm(lockPath, { force: true }).catch(() => undefined)
          throw error
        }
      }

      const owner = await existingLock(lockPath)
      if (owner === "missing") continue
      if (!owner) {
        throw new AppError(
          "OPERATION_LOCKED",
          `El lock de operación es inválido y requiere revisión manual: ${lockPath}`,
          3,
          { lockPath },
        )
      }
      if (processExists(owner.pid)) {
        throw new AppError(
          "OPERATION_LOCKED",
          `Ya hay una operación ${owner.operation} en curso (PID ${owner.pid})`,
          3,
          {
            lockPath,
            owner: {
              pid: owner.pid,
              operation: owner.operation,
              startedAt: owner.startedAt,
            },
          },
        )
      }
      await rm(lockPath, { force: true })
    }

    throw new AppError(
      "OPERATION_LOCKED",
      `No se pudo adquirir el lock de operación: ${lockPath}`,
      3,
      { lockPath },
    )
  } catch (error) {
    if (createdDirectory) {
      try {
        await rmdir(directory)
      } catch (cleanupError) {
        const code = (cleanupError as NodeJS.ErrnoException).code
        if (code !== "ENOENT" && code !== "ENOTEMPTY" && code !== "EEXIST") {
          throw new AggregateError(
            [error as Error, cleanupError as Error],
            "Fallaron la adquisición del lock y su limpieza",
          )
        }
      }
    }
    throw error
  }
}

export async function withOperationLock<T>(
  context: BuildContext,
  operation: MutableOperation,
  signal: AbortSignal,
  action: () => Promise<T>,
): Promise<T> {
  const lock = await acquireOperationLock(context, operation, signal)
  try {
    throwIfAborted(signal)
    return await action()
  } finally {
    await lock.release()
  }
}
