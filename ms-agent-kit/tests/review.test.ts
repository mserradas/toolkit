import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { isSensitivePath } from "../src/core/permissions.js"
import {
  fingerprintStagedReview,
  fingerprintWorktreeReview,
} from "../src/core/review.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" })
}

async function repository(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-review-"))
  temporaryDirectories.push(root)
  git(root, "init", "--quiet")
  git(root, "config", "user.email", "tests@example.com")
  git(root, "config", "user.name", "Tests")
  await writeFile(path.join(root, "README.md"), "baseline\n")
  git(root, "add", "README.md")
  git(root, "commit", "--quiet", "-m", "baseline")
  return root
}

describe("review fingerprints", () => {
  it("fingerprints unstaged tracked and untracked worktree changes", async () => {
    const root = await repository()
    await writeFile(path.join(root, "README.md"), "changed\n")
    await writeFile(path.join(root, "feature.ts"), "export const feature = true\n")

    const first = await fingerprintWorktreeReview(root)
    expect(first).toMatchObject({
      scope: "worktree",
      files: ["README.md", "feature.ts"],
      fileCount: 2,
      untrackedFiles: 1,
      additions: 2,
      deletions: 1,
    })
    expect(await fingerprintWorktreeReview(root)).toEqual(first)

    await writeFile(path.join(root, "feature.ts"), "export const feature = false\n")
    expect((await fingerprintWorktreeReview(root)).fingerprint).not.toBe(first.fingerprint)
  })

  it("includes staged and later unstaged content in an unborn worktree", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-unborn-review-"))
    temporaryDirectories.push(root)
    git(root, "init", "--quiet")
    await writeFile(path.join(root, "feature.ts"), "export const value = 1\n")
    git(root, "add", "feature.ts")
    await writeFile(path.join(root, "feature.ts"), "export const value = 2\n")

    const first = await fingerprintWorktreeReview(root)
    expect(first).toMatchObject({ baseCommit: "UNBORN", files: ["feature.ts"] })
    await writeFile(path.join(root, "feature.ts"), "export const value = 3\n")
    expect((await fingerprintWorktreeReview(root)).fingerprint).not.toBe(first.fingerprint)
  })

  it("is deterministic for one staged candidate and changes with its content", async () => {
    const root = await repository()
    await mkdir(path.join(root, "src"))
    await writeFile(path.join(root, "src", "feature.ts"), "export const value = 1\n")
    git(root, "add", "src/feature.ts")

    const first = await fingerprintStagedReview(root)
    const repeated = await fingerprintStagedReview(root)
    expect(repeated).toEqual(first)
    expect(first).toMatchObject({
      schema: "ms-review-fingerprint/v1",
      scope: "staged",
      files: ["src/feature.ts"],
      fileCount: 1,
      additions: 1,
      deletions: 0,
    })
    expect(first.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/)

    await writeFile(path.join(root, "src", "feature.ts"), "export const value = 2\n")
    git(root, "add", "src/feature.ts")
    expect((await fingerprintStagedReview(root)).fingerprint).not.toBe(first.fingerprint)
  })

  it("rejects staged secret paths while allowing environment templates", async () => {
    expect(isSensitivePath("services/api/.env.secret")).toBe(true)
    expect(isSensitivePath(".env.example")).toBe(false)
    expect(isSensitivePath("fixtures/.env.sample")).toBe(false)

    const root = await repository()
    await writeFile(path.join(root, ".env.secret"), "TOKEN=secret\n")
    git(root, "add", "-f", ".env.secret")

    await expect(fingerprintStagedReview(root)).rejects.toThrow("ruta sensible")
  })

  it("rejects a secret even when the staged candidate renames it to a safe path", async () => {
    const root = await repository()
    await writeFile(path.join(root, ".env.secret"), "TOKEN=secret\n")
    git(root, "add", "-f", ".env.secret")
    git(root, "commit", "--quiet", "-m", "secret fixture")
    git(root, "mv", ".env.secret", "config.txt")

    await expect(fingerprintStagedReview(root)).rejects.toThrow("ruta sensible")
  })

  it("rejects untracked secrets from a worktree candidate", async () => {
    const root = await repository()
    await writeFile(path.join(root, ".env.private"), "TOKEN=secret\n")

    await expect(fingerprintWorktreeReview(root)).rejects.toThrow("ruta sensible")
  })
})
