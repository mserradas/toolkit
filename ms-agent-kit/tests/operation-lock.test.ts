import { spawn } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { AppError } from "../src/core/errors.js"
import {
  acquireOperationLock,
  operationLockPath,
} from "../src/core/operation-lock.js"
import { stateLocation } from "../src/core/state.js"
import type { BuildContext } from "../src/core/types.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

async function testContext(): Promise<BuildContext> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-lock-"))
  temporaryDirectories.push(projectRoot)
  return {
    assetsRoot: path.join(projectRoot, "assets"),
    homeDir: path.join(projectRoot, "home"),
    projectRoot,
    scope: "project",
  }
}

async function deadProcessId(): Promise<number> {
  const child = spawn(process.execPath, ["-e", ""])
  const pid = child.pid
  if (pid === undefined) throw new Error("No se pudo obtener el PID del proceso de prueba")
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject)
    child.once("close", () => resolve())
  })
  return pid
}

describe("operation lock", () => {
  it("serializes mutable operations and releases only its own lock", async () => {
    const context = await testContext()
    const lock = await acquireOperationLock(context, "install")

    expect((await stat(lock.path)).mode & 0o777).toBe(0o600)
    const metadata = JSON.parse(await readFile(lock.path, "utf8")) as {
      pid: number
      operation: string
      token?: string
    }
    expect(metadata).toMatchObject({ pid: process.pid, operation: "install" })
    expect(metadata.token).toBeTypeOf("string")

    await expect(acquireOperationLock(context, "uninstall")).rejects.toMatchObject({
      code: "OPERATION_LOCKED",
      exitCode: 3,
    })

    await lock.release()
    const next = await acquireOperationLock(context, "uninstall")
    await next.release()
    await expect(stat(operationLockPath(context))).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("preserves a lock whose ownership token changed before release", async () => {
    const context = await testContext()
    const lock = await acquireOperationLock(context, "install")
    await writeFile(
      lock.path,
      `${JSON.stringify({
        pid: process.pid,
        operation: "uninstall",
        startedAt: new Date().toISOString(),
        token: "replacement-owner",
      })}\n`,
    )

    await lock.release()
    expect(JSON.parse(await readFile(lock.path, "utf8"))).toMatchObject({
      operation: "uninstall",
      token: "replacement-owner",
    })
  })

  it("recovers a well-formed lock owned by a dead process", async () => {
    const context = await testContext()
    const location = stateLocation(context)
    const deadPid = await deadProcessId()
    await mkdir(location.directory, { recursive: true })
    await writeFile(
      operationLockPath(context),
      `${JSON.stringify({
        pid: deadPid,
        operation: "install",
        startedAt: new Date(0).toISOString(),
        token: "stale-owner",
      })}\n`,
    )

    const lock = await acquireOperationLock(context, "uninstall")
    const metadata = JSON.parse(await readFile(lock.path, "utf8")) as {
      pid: number
      operation: string
    }
    expect(metadata).toMatchObject({ pid: process.pid, operation: "uninstall" })
    await lock.release()
  })

  it("allows only one contender to replace a stale lock", async () => {
    const context = await testContext()
    const location = stateLocation(context)
    await mkdir(location.directory, { recursive: true })
    await writeFile(
      operationLockPath(context),
      `${JSON.stringify({
        pid: await deadProcessId(),
        operation: "install",
        startedAt: new Date(0).toISOString(),
        token: "stale-owner",
      })}\n`,
    )

    const contenders = await Promise.allSettled([
      acquireOperationLock(context, "install"),
      acquireOperationLock(context, "uninstall"),
    ])
    const acquired = contenders
      .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof acquireOperationLock>>> =>
        result.status === "fulfilled",
      )
      .map((result) => result.value)
    expect(acquired).toHaveLength(1)
    await acquired[0]!.release()
  })

  it("does not guess ownership when lock metadata is malformed", async () => {
    const context = await testContext()
    const location = stateLocation(context)
    await mkdir(location.directory, { recursive: true })
    await writeFile(operationLockPath(context), "{not-json")

    await expect(acquireOperationLock(context, "install")).rejects.toMatchObject({
      code: "OPERATION_LOCKED",
      exitCode: 3,
    })
    expect(await readFile(operationLockPath(context), "utf8")).toBe("{not-json")
  })

  it("honors cancellation before touching the filesystem", async () => {
    const context = await testContext()
    const controller = new AbortController()
    controller.abort(new AppError("OPERATION_CANCELLED", "cancelled", 130))

    await expect(
      acquireOperationLock(context, "install", controller.signal),
    ).rejects.toMatchObject({
      code: "OPERATION_CANCELLED",
      exitCode: 130,
    })
    await expect(stat(operationLockPath(context))).rejects.toMatchObject({ code: "ENOENT" })
  })
})
