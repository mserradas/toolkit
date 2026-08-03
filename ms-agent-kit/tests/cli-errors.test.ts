import { execFile } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, it } from "vitest"
import { DEFAULT_ASSETS_ROOT } from "../src/core/catalog.js"
import { acquireOperationLock } from "../src/core/operation-lock.js"
import { stateLocation } from "../src/core/state.js"
import type { BuildContext } from "../src/core/types.js"

const execFileAsync = promisify(execFile)
const cli = path.resolve("src", "cli.ts")
const temporaryDirectories: string[] = []

interface CliFailure {
  code: number
  stdout: string
  stderr: string
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

async function runFailingCli(args: string[]): Promise<CliFailure> {
  try {
    await execFileAsync(process.execPath, ["--import", "tsx", cli, ...args])
  } catch (error) {
    return error as CliFailure
  }
  throw new Error("Se esperaba que el CLI fallara")
}

async function testContext(): Promise<BuildContext> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-cli-errors-"))
  temporaryDirectories.push(projectRoot)
  return {
    assetsRoot: DEFAULT_ASSETS_ROOT,
    homeDir: path.join(projectRoot, "home"),
    projectRoot,
    scope: "project",
  }
}

function commonArgs(context: BuildContext): string[] {
  return [
    "--target",
    "codex",
    "--scope",
    "project",
    "--project",
    context.projectRoot,
    "--home",
    context.homeDir,
    "--assets",
    context.assetsRoot,
    "--json",
  ]
}

describe("CLI error contract", () => {
  it("returns stable JSON and exit 2 for invalid input", async () => {
    const result = await runFailingCli(["unknown", "--json"])

    expect(result.code).toBe(2)
    expect(result.stdout).toBe("")
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      code: "INVALID_ARGUMENT",
      message: expect.stringContaining("Comando desconocido"),
    })
  })

  it("returns stable JSON and exit 4 for incompatible state", async () => {
    const context = await testContext()
    const location = stateLocation(context)
    await mkdir(location.directory, { recursive: true })
    await writeFile(location.path, "{not-json")

    const result = await runFailingCli(["status", ...commonArgs(context)])

    expect(result.code).toBe(4)
    expect(result.stdout).toBe("")
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      code: "STATE_INVALID",
      details: { statePath: location.path, reason: "JSON inválido" },
    })
  })

  it("returns stable JSON and exit 3 when another mutation owns the lock", async () => {
    const context = await testContext()
    const lock = await acquireOperationLock(context, "install")
    try {
      const result = await runFailingCli([
        "install",
        ...commonArgs(context),
        "--yes",
      ])

      expect(result.code).toBe(3)
      expect(result.stdout).toBe("")
      expect(JSON.parse(result.stderr)).toMatchObject({
        ok: false,
        code: "OPERATION_LOCKED",
        details: {
          owner: { pid: process.pid, operation: "install" },
        },
      })
    } finally {
      await lock.release()
    }
  })
})
