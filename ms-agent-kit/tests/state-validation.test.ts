import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { readState, stateLocation, writeState } from "../src/core/state.js"
import type { BuildContext, InstallState } from "../src/core/types.js"

const temporaryDirectories: string[] = []
const SHA256 = "a".repeat(64)

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

async function testContext(): Promise<BuildContext> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-state-"))
  temporaryDirectories.push(projectRoot)
  return {
    assetsRoot: path.join(projectRoot, "assets"),
    homeDir: path.join(projectRoot, "home"),
    projectRoot,
    scope: "project",
  }
}

function validState(context: BuildContext): InstallState {
  const root = path.join(context.projectRoot, ".codex")
  return {
    schemaVersion: 1,
    scope: "project",
    root: context.projectRoot,
    files: [
      {
        target: "codex",
        targets: ["codex"],
        kind: "documentation",
        name: "AGENTS.md",
        root,
        path: path.join(root, "AGENTS.md"),
        afterHash: SHA256,
        original: { existed: false },
        installedAt: new Date(0).toISOString(),
      },
    ],
    updatedAt: new Date(0).toISOString(),
  }
}

async function writeRawState(context: BuildContext, value: unknown): Promise<void> {
  const location = stateLocation(context)
  await mkdir(location.directory, { recursive: true })
  await writeFile(
    location.path,
    typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`,
  )
}

describe("runtime state validation", () => {
  it("round-trips a valid state", async () => {
    const context = await testContext()
    const state = validState(context)
    await writeState(context, state)
    expect(await readState(context)).toEqual(state)
  })

  it("reports malformed JSON as a stable state error", async () => {
    const context = await testContext()
    await writeRawState(context, "{not-json")

    await expect(readState(context)).rejects.toMatchObject({
      code: "STATE_INVALID",
      exitCode: 4,
      details: {
        statePath: stateLocation(context).path,
        reason: "JSON inválido",
      },
    })
  })

  it("rejects a state directory redirected through a symlink", async () => {
    const context = await testContext()
    const outside = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-state-outside-"))
    temporaryDirectories.push(outside)
    await symlink(outside, stateLocation(context).directory, "dir")

    await expect(readState(context)).rejects.toMatchObject({
      code: "STATE_INVALID",
      exitCode: 4,
      details: {
        statePath: stateLocation(context).path,
        unsafePath: stateLocation(context).path,
      },
    })
  })

  it.each([
    {
      name: "a root outside the requested scope",
      mutate(state: InstallState) {
        state.root = path.dirname(state.root)
      },
    },
    {
      name: "a destination outside its declared root",
      mutate(state: InstallState) {
        state.files[0]!.path = path.join(state.root, "escaped.md")
      },
    },
    {
      name: "a backup outside the state directory",
      mutate(state: InstallState) {
        state.files[0]!.original = {
          existed: true,
          backupPath: path.join(state.root, "outside.before"),
          mode: 0o644,
        }
      },
    },
    {
      name: "an unrelated file inside the state directory as backup",
      mutate(state: InstallState) {
        state.files[0]!.original = {
          existed: true,
          backupPath: path.join(state.root, ".ms-agent-kit", "state.json"),
          mode: 0o644,
        }
      },
    },
    {
      name: "an invalid content hash",
      mutate(state: InstallState) {
        state.files[0]!.afterHash = "not-a-hash"
      },
    },
    {
      name: "duplicate destinations",
      mutate(state: InstallState) {
        state.files.push(structuredClone(state.files[0]!))
      },
    },
  ])("rejects $name", async ({ mutate }) => {
    const context = await testContext()
    const state = validState(context)
    mutate(state)
    await writeRawState(context, state)

    await expect(readState(context)).rejects.toMatchObject({
      code: "STATE_INVALID",
      exitCode: 4,
    })
  })
})
