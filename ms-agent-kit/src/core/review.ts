import { execFile } from "node:child_process"
import { lstat } from "node:fs/promises"
import { devNull } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { hashContent } from "./files.js"
import { isSensitivePath } from "./permissions.js"
import { assertPathWithin } from "./security.js"

const execFileAsync = promisify(execFile)

export interface ReviewFingerprint {
  schema: "ms-review-fingerprint/v1"
  scope: "worktree" | "staged"
  fingerprint: string
  baseCommit: string
  files: string[]
  fileCount: number
  untrackedFiles: number
  additions: number
  deletions: number
}

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    })
    return stdout
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim()
    throw new Error(stderr || `git ${args.join(" ")} fallo`)
  }
}

async function gitDiffNoIndex(cwd: string, filePath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--no-index", "--numstat", "--", devNull, filePath],
      { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    )
    return stdout
  } catch (error) {
    const result = error as { code?: number; stdout?: string; stderr?: string }
    if (result.code === 1) return result.stdout ?? ""
    throw new Error(result.stderr?.trim() || `git diff --no-index fallo para ${filePath}`)
  }
}

function parseNumstat(value: string): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const line of value.split("\n")) {
    if (!line) continue
    const [added, deleted] = line.split("\t")
    if (added && added !== "-") additions += Number.parseInt(added, 10) || 0
    if (deleted && deleted !== "-") deletions += Number.parseInt(deleted, 10) || 0
  }
  return { additions, deletions }
}

function changedPaths(value: string): { files: string[]; allPaths: string[] } {
  const fields = value.split("\0").filter(Boolean)
  const files: string[] = []
  const allPaths: string[] = []
  for (let index = 0; index < fields.length; ) {
    const status = fields[index++]!
    const source = fields[index++]
    if (!source) throw new Error("Git devolvio un name-status incompleto")
    allPaths.push(source)
    if (status.startsWith("R") || status.startsWith("C")) {
      const destination = fields[index++]
      if (!destination) throw new Error("Git devolvio un rename/copy incompleto")
      allPaths.push(destination)
      files.push(destination)
    } else {
      files.push(source)
    }
  }
  return { files: files.sort(), allPaths }
}

async function baseCommit(gitRoot: string): Promise<string> {
  try {
    return (await git(gitRoot, ["rev-parse", "--verify", "HEAD"])).trim()
  } catch {
    return "UNBORN"
  }
}

async function untrackedSnapshot(
  gitRoot: string,
  files: string[],
): Promise<{ hashes: string[]; additions: number; deletions: number }> {
  const snapshots = await Promise.all(
    files.map(async (file) => {
      const absolutePath = path.resolve(gitRoot, file)
      assertPathWithin(gitRoot, absolutePath)
      const info = await lstat(absolutePath)
      if (info.isSymbolicLink() || !info.isFile()) {
        throw new Error(`El candidato worktree contiene una ruta no regular: ${file}`)
      }
      const [blobHash, numstat] = await Promise.all([
        git(gitRoot, ["hash-object", "--no-filters", "--", file]),
        gitDiffNoIndex(gitRoot, absolutePath),
      ])
      return {
        identity: `${file}\0${info.mode & 0o777}\0${blobHash.trim()}`,
        stats: parseNumstat(numstat),
      }
    }),
  )
  return {
    hashes: snapshots.map((snapshot) => snapshot.identity).sort(),
    additions: snapshots.reduce((total, snapshot) => total + snapshot.stats.additions, 0),
    deletions: snapshots.reduce((total, snapshot) => total + snapshot.stats.deletions, 0),
  }
}

export async function fingerprintWorktreeReview(projectRootInput: string): Promise<ReviewFingerprint> {
  const projectRoot = path.resolve(projectRootInput)
  const gitRoot = (await git(projectRoot, ["rev-parse", "--show-toplevel"])).trim()
  const commit = await baseCommit(gitRoot)
  const trackedRequests =
    commit === "UNBORN"
      ? [
          ["diff", "--cached", "--name-status", "-z", "--find-renames", "--find-copies"],
          ["diff", "--name-status", "-z", "--find-renames", "--find-copies"],
        ]
      : [["diff", "HEAD", "--name-status", "-z", "--find-renames", "--find-copies"]]
  const trackedDiffRequests =
    commit === "UNBORN"
      ? [
          ["diff", "--cached", "--binary", "--full-index", "--no-ext-diff", "--"],
          ["diff", "--binary", "--full-index", "--no-ext-diff", "--"],
        ]
      : [["diff", "HEAD", "--binary", "--full-index", "--no-ext-diff", "--"]]
  const trackedStatRequests =
    commit === "UNBORN"
      ? [
          ["diff", "--cached", "--numstat", "--no-ext-diff", "--"],
          ["diff", "--numstat", "--no-ext-diff", "--"],
        ]
      : [["diff", "HEAD", "--numstat", "--no-ext-diff", "--"]]
  const [trackedOutputs, untrackedOutput] = await Promise.all([
    Promise.all(trackedRequests.map((args) => git(gitRoot, args))),
    git(gitRoot, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ])
  const trackedParts = trackedOutputs.map(changedPaths)
  const tracked = {
    files: [...new Set(trackedParts.flatMap((part) => part.files))].sort(),
    allPaths: [...new Set(trackedParts.flatMap((part) => part.allPaths))],
  }
  const untracked = untrackedOutput.split("\0").filter(Boolean).sort()
  const allPaths = [...tracked.allPaths, ...untracked]
  if (allPaths.length === 0) throw new Error("No hay cambios en el worktree para calcular una huella")
  if (allPaths.some(isSensitivePath)) {
    throw new Error("El candidato worktree contiene una ruta sensible; no se calcula la huella")
  }

  const [diffParts, trackedNumstatParts, untrackedData] = await Promise.all([
    Promise.all(trackedDiffRequests.map((args) => git(gitRoot, args))),
    Promise.all(trackedStatRequests.map((args) => git(gitRoot, args))),
    untrackedSnapshot(gitRoot, untracked),
  ])
  const trackedStats = parseNumstat(trackedNumstatParts.join("\n"))
  const files = [...new Set([...tracked.files, ...untracked])].sort()
  const fingerprint = hashContent(
    [
      "ms-review-fingerprint/v1",
      "worktree",
      commit,
      files.join("\n"),
      diffParts.join("\0WORKTREE_LAYER\0"),
      untrackedData.hashes.join("\n"),
    ].join("\0"),
  )

  return {
    schema: "ms-review-fingerprint/v1",
    scope: "worktree",
    fingerprint: `sha256:${fingerprint}`,
    baseCommit: commit,
    files,
    fileCount: files.length,
    untrackedFiles: untracked.length,
    additions: trackedStats.additions + untrackedData.additions,
    deletions: trackedStats.deletions + untrackedData.deletions,
  }
}

export async function fingerprintStagedReview(projectRootInput: string): Promise<ReviewFingerprint> {
  const projectRoot = path.resolve(projectRootInput)
  const gitRoot = (await git(projectRoot, ["rev-parse", "--show-toplevel"])).trim()
  const fileOutput = await git(gitRoot, [
    "diff",
    "--cached",
    "--name-status",
    "-z",
    "--find-renames",
    "--find-copies",
    "--diff-filter=ACDMRTUXB",
  ])
  const { files, allPaths } = changedPaths(fileOutput)
  if (files.length === 0) throw new Error("No hay cambios staged para calcular una huella")
  if (allPaths.some(isSensitivePath)) {
    throw new Error("El candidato staged contiene una ruta sensible; no se calcula la huella")
  }

  const commit = await baseCommit(gitRoot)
  const [diff, numstat] = await Promise.all([
    git(gitRoot, ["diff", "--cached", "--binary", "--full-index", "--no-ext-diff", "--"]),
    git(gitRoot, ["diff", "--cached", "--numstat", "--no-ext-diff", "--"]),
  ])
  const stats = parseNumstat(numstat)
  const fingerprint = hashContent(
    ["ms-review-fingerprint/v1", "staged", commit, files.join("\n"), diff].join("\0"),
  )

  return {
    schema: "ms-review-fingerprint/v1",
    scope: "staged",
    fingerprint: `sha256:${fingerprint}`,
    baseCommit: commit,
    files,
    fileCount: files.length,
    untrackedFiles: 0,
    ...stats,
  }
}

export async function fingerprintReview(
  projectRoot: string,
  scope: "worktree" | "staged" = "worktree",
): Promise<ReviewFingerprint> {
  return scope === "staged"
    ? fingerprintStagedReview(projectRoot)
    : fingerprintWorktreeReview(projectRoot)
}
