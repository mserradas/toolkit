import { mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { AppError } from "./errors.js"
import { atomicWriteFile, hashContent } from "./files.js"
import { assertNoSymlinkEscape } from "./security.js"
import { parseInstallState } from "./state-validation.js"
import type { BuildContext, InstallState } from "./types.js"

export interface StateLocation {
  directory: string
  path: string
}

export function stateLocation(context: BuildContext): StateLocation {
  const root = path.resolve(context.scope === "user" ? context.homeDir : context.projectRoot)
  const directory = path.join(root, ".ms-agent-kit")
  return { directory, path: path.join(directory, "state.json") }
}

export function emptyState(context: BuildContext): InstallState {
  return {
    schemaVersion: 1,
    scope: context.scope,
    root: path.resolve(context.scope === "user" ? context.homeDir : context.projectRoot),
    files: [],
    updatedAt: new Date(0).toISOString(),
  }
}

function contextRoot(context: BuildContext): string {
  return context.scope === "user" ? context.homeDir : context.projectRoot
}

export async function assertSafeStatePath(
  context: BuildContext,
  destination = stateLocation(context).path,
): Promise<void> {
  try {
    await assertNoSymlinkEscape(contextRoot(context), destination)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code) throw error
    const location = stateLocation(context)
    throw new AppError(
      "STATE_INVALID",
      `Estado inseguro en ${location.path}: ${(error as Error).message}`,
      4,
      {
        statePath: location.path,
        unsafePath: destination,
        reason: (error as Error).message,
      },
    )
  }
}

export async function readState(context: BuildContext): Promise<InstallState> {
  const location = stateLocation(context)
  await assertSafeStatePath(context, location.path)
  try {
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(location.path, "utf8")) as unknown
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new AppError(
          "STATE_INVALID",
          `Estado incompatible en ${location.path}: JSON inválido`,
          4,
          { statePath: location.path, reason: "JSON inválido" },
        )
      }
      throw error
    }
    return parseInstallState(parsed, context, location.path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState(context)
    throw error
  }
}

export async function writeState(context: BuildContext, state: InstallState): Promise<void> {
  const location = stateLocation(context)
  const validatedState = parseInstallState(state, context, location.path)
  const root = contextRoot(context)
  await assertSafeStatePath(context, location.path)
  await mkdir(location.directory, { recursive: true, mode: 0o700 })
  await assertSafeStatePath(context, location.path)
  const content = Buffer.from(`${JSON.stringify(validatedState, null, 2)}\n`, "utf8")
  await atomicWriteFile(root, location.path, content, 0o600)
}

export function backupPathFor(stateDir: string, destination: string): string {
  return path.join(stateDir, "backups", `${hashContent(destination)}.before`)
}
