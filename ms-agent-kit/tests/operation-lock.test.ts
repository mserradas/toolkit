import { spawn } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import * as files from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AppError } from "../src/core/errors.js"
import {
  acquireOperationLock,
  operationLockPath,
} from "../src/core/operation-lock.js"
import { stateLocation } from "../src/core/state.js"
import type { BuildContext } from "../src/core/types.js"

const temporaryDirectories: string[] = []

vi.mock("node:fs/promises", async (importOriginal) => ({ ...await importOriginal<typeof import("node:fs/promises")>() }))

afterEach(async () => {
  vi.restoreAllMocks()
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

  it("preserves a new owner when a contender resumes with an earlier stale observation", async () => {
    const context = await testContext()
    const lockPath = operationLockPath(context)
    await mkdir(stateLocation(context).directory, { recursive: true })
    await writeFile(lockPath, JSON.stringify({ pid: await deadProcessId(), operation: "install", startedAt: new Date(0).toISOString(), token: "stale-owner" }))
    const readOriginal = files.readFile
    let observed = 0
    let releaseFirst!: () => void
    let releaseSecond!: () => void
    const bothObserved = new Promise<void>((resolve) => { releaseFirst = resolve })
    const newOwnerAcquired = new Promise<void>((resolve) => { releaseSecond = resolve })
    vi.spyOn(files, "readFile").mockImplementation(async (...args) => {
      const result = await readOriginal(...args)
      if (String(args[0]) === lockPath && String(result).includes("stale-owner") && observed < 2) {
        observed += 1
        if (observed === 1) await bothObserved
        else { releaseFirst(); await newOwnerAcquired }
      }
      return result
    })
    const attempts = [acquireOperationLock(context, "install"), acquireOperationLock(context, "uninstall")]
    const winner = await Promise.race(attempts)
    const winnerContent = await readOriginal(lockPath, "utf8")
    releaseSecond()
    const results = await Promise.allSettled(attempts)
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    expect(await readOriginal(lockPath, "utf8")).toBe(winnerContent)
    await expect(stat(`${lockPath}.recovery`)).rejects.toMatchObject({ code: "ENOENT" })
    await winner.release()
  })

  it.each([true, false])("preserves an existing recovery marker without touching the main lock (lock exists: %s)", async (withLock) => {
    const context = await testContext()
    const lockPath = operationLockPath(context)
    await mkdir(`${lockPath}.recovery`, { recursive: true })
    const content = JSON.stringify({ pid: await deadProcessId(), operation: "install", startedAt: new Date(0).toISOString(), token: "stale-owner" })
    if (withLock) await writeFile(lockPath, content)
    await expect(acquireOperationLock(context, "install")).rejects.toMatchObject({ code: "OPERATION_LOCKED", details: { recoveryPath: `${lockPath}.recovery` } })
    expect((await stat(`${lockPath}.recovery`)).isDirectory()).toBe(true)
    if (withLock) expect(await readFile(lockPath, "utf8")).toBe(content)
    else await expect(stat(lockPath)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it.each(["cancel", "invalid", "live", "remove-error"])("cleans its recovery marker and preserves the main lock on %s", async (failure) => {
    const context = await testContext()
    const lockPath = operationLockPath(context)
    const recoveryPath = `${lockPath}.recovery`
    await mkdir(stateLocation(context).directory, { recursive: true })
    const original = JSON.stringify({ pid: await deadProcessId(), operation: "install", startedAt: new Date(0).toISOString(), token: "stale-owner" })
    await writeFile(lockPath, original)
    const controller = new AbortController()
    const mkdirOriginal = files.mkdir
    let expectedContent = original
    vi.spyOn(files, "mkdir").mockImplementation(async (...args) => {
      const result = await mkdirOriginal(...args)
      if (String(args[0]) === recoveryPath) {
        if (failure === "cancel") controller.abort(new AppError("OPERATION_CANCELLED", "cancelled", 130))
        if (failure === "invalid") expectedContent = "{invalid"
        if (failure === "live") expectedContent = JSON.stringify({ pid: process.pid, operation: "install", startedAt: new Date().toISOString(), token: "new-live-owner" })
        if (failure === "invalid" || failure === "live") await writeFile(lockPath, expectedContent)
      }
      return result
    })
    if (failure === "remove-error") {
      const rmOriginal = files.rm
      vi.spyOn(files, "rm").mockImplementation(async (...args) => {
        if (String(args[0]) === lockPath) throw Object.assign(new Error("remove denied"), { code: "EACCES" })
        return rmOriginal(...args)
      })
    }
    await expect(acquireOperationLock(context, "install", controller.signal)).rejects.toBeDefined()
    expect(await readFile(lockPath, "utf8")).toBe(expectedContent)
    await expect(stat(recoveryPath)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("rejects a recovery marker symlink", async () => {
    const context = await testContext()
    const lockPath = operationLockPath(context)
    await mkdir(stateLocation(context).directory, { recursive: true })
    await symlink(context.projectRoot, `${lockPath}.recovery`)
    await expect(acquireOperationLock(context, "install")).rejects.toMatchObject({ code: "STATE_INVALID" })
    expect((await stat(context.projectRoot)).isDirectory()).toBe(true)
    await expect(stat(lockPath)).rejects.toMatchObject({ code: "ENOENT" })
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
