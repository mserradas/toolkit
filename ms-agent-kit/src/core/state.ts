import { mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { atomicWriteFile, hashContent } from "./files.js"
import type { BuildContext, InstallState } from "./types.js"

export interface StateLocation {
  directory: string
  path: string
}

export function stateLocation(context: BuildContext): StateLocation {
  const directory =
    context.scope === "user"
      ? path.join(context.homeDir, ".ms-agent-kit")
      : path.join(context.projectRoot, ".ms-agent-kit")
  return { directory, path: path.join(directory, "state.json") }
}

export function emptyState(context: BuildContext): InstallState {
  return {
    schemaVersion: 1,
    scope: context.scope,
    root: context.scope === "user" ? context.homeDir : context.projectRoot,
    files: [],
    updatedAt: new Date(0).toISOString(),
  }
}

export async function readState(context: BuildContext): Promise<InstallState> {
  const location = stateLocation(context)
  try {
    const parsed = JSON.parse(await readFile(location.path, "utf8")) as InstallState
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.files)) {
      throw new Error(`Estado incompatible en ${location.path}`)
    }
    if (parsed.scope !== context.scope) {
      throw new Error(`El alcance del estado no coincide en ${location.path}`)
    }
    return parsed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState(context)
    throw error
  }
}

export async function writeState(context: BuildContext, state: InstallState): Promise<void> {
  const location = stateLocation(context)
  await mkdir(location.directory, { recursive: true, mode: 0o700 })
  const content = Buffer.from(`${JSON.stringify(state, null, 2)}\n`, "utf8")
  await atomicWriteFile(location.directory, location.path, content, 0o600)
}

export function backupPathFor(stateDir: string, destination: string): string {
  return path.join(stateDir, "backups", `${hashContent(destination)}.before`)
}
