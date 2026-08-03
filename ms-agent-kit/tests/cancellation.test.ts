import { access, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { AppError } from "../src/core/errors.js"
import { applyPlan, installationStatus, uninstallTargets } from "../src/core/installer.js"
import { createPlan } from "../src/core/planner.js"
import { createTerminationController } from "../src/core/termination.js"
import type { Artifact, BuildContext } from "../src/core/types.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

async function testContext(): Promise<BuildContext> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-cancel-"))
  temporaryDirectories.push(projectRoot)
  return {
    assetsRoot: path.join(projectRoot, "assets"),
    homeDir: path.join(projectRoot, "home"),
    projectRoot,
    scope: "project",
  }
}

function artifacts(context: BuildContext): Artifact[] {
  const root = path.join(context.projectRoot, ".codex")
  return ["a.md", "b.md"].map((name) => ({
    target: "codex",
    kind: "documentation",
    name,
    root,
    destination: path.join(root, name),
    content: Buffer.from(`${name}\n`),
    mode: 0o644,
  }))
}

function abortOnCheck(check: number): AbortSignal {
  let checks = 0
  const reason = new AppError("OPERATION_CANCELLED", "cancelled in test", 130)
  return {
    throwIfAborted() {
      checks += 1
      if (checks === check) throw reason
    },
  } as AbortSignal
}

describe("cooperative cancellation", () => {
  it("rolls back files already written when install is cancelled", async () => {
    const context = await testContext()
    const desired = artifacts(context)
    const plan = await createPlan(desired, context)

    await expect(applyPlan(plan, context, abortOnCheck(6))).rejects.toMatchObject({
      code: "OPERATION_CANCELLED",
      exitCode: 130,
    })
    await expect(access(desired[0]!.destination)).rejects.toMatchObject({ code: "ENOENT" })
    await expect(access(desired[1]!.destination)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await installationStatus(["codex"], context)).toEqual([])
  })

  it("rolls back files already removed when uninstall is cancelled", async () => {
    const context = await testContext()
    const desired = artifacts(context)
    await applyPlan(await createPlan(desired, context), context)

    await expect(
      uninstallTargets(["codex"], context, abortOnCheck(4)),
    ).rejects.toMatchObject({
      code: "OPERATION_CANCELLED",
      exitCode: 130,
    })
    await expect(access(desired[0]!.destination)).resolves.toBeUndefined()
    await expect(access(desired[1]!.destination)).resolves.toBeUndefined()
    expect(await installationStatus(["codex"], context)).toEqual([
      { target: "codex", path: desired[0]!.destination, status: "ok" },
      { target: "codex", path: desired[1]!.destination, status: "ok" },
    ])
  })

  it("maps termination signals to conventional exit codes", () => {
    const interrupted = createTerminationController()
    interrupted.abort("SIGINT")
    expect(() => interrupted.signal.throwIfAborted()).toThrow(
      expect.objectContaining({
        code: "OPERATION_CANCELLED",
        exitCode: 130,
        details: { signal: "SIGINT" },
      }),
    )

    const terminated = createTerminationController()
    terminated.abort("SIGTERM")
    expect(() => terminated.signal.throwIfAborted()).toThrow(
      expect.objectContaining({
        code: "OPERATION_CANCELLED",
        exitCode: 143,
        details: { signal: "SIGTERM" },
      }),
    )
  })
})
