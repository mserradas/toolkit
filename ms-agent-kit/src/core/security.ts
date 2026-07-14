import path from "node:path"
import { lstat, realpath } from "node:fs/promises"

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "OpenAI-like token", pattern: /\bsk-[A-Za-z0-9_-]{24,}\b/ },
  { name: "GitHub token", pattern: /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
]

export function assertNoEmbeddedSecrets(content: string, source: string): void {
  for (const secret of SECRET_PATTERNS) {
    if (secret.pattern.test(content)) {
      throw new Error(`Se detecto un posible secreto (${secret.name}) en ${source}`)
    }
  }
}

export function assertPathWithin(root: string, destination: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(destination))
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return
  }
  throw new Error(`Ruta fuera del root permitido: ${destination}`)
}

async function nearestExistingParent(input: string): Promise<string> {
  let current = input
  while (true) {
    try {
      await lstat(current)
      return current
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      const parent = path.dirname(current)
      if (parent === current) return current
      current = parent
    }
  }
}

async function resolveExistingPath(input: string): Promise<string> {
  try {
    return await realpath(input)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Se rechaza una ruta con symlink roto: ${input}`)
    }
    throw error
  }
}

export async function assertNoSymlinkEscape(root: string, destination: string): Promise<void> {
  assertPathWithin(root, destination)

  try {
    const info = await lstat(destination)
    if (info.isSymbolicLink()) {
      throw new Error(`Se rechaza escribir sobre un symlink: ${destination}`)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }

  const existingRoot = await nearestExistingParent(root)
  const existingParent = await nearestExistingParent(path.dirname(destination))
  const [resolvedRoot, resolvedParent] = await Promise.all([
    resolveExistingPath(existingRoot),
    resolveExistingPath(existingParent),
  ])

  const relative = path.relative(resolvedRoot, resolvedParent)
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return
  }
  throw new Error(`La ruta escapa del root mediante symlink: ${destination}`)
}
