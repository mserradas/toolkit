import { spawn } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildArtifacts } from "../src/adapters/index.js"
import { DEFAULT_ASSETS_ROOT } from "../src/core/catalog.js"
import type { BuildContext } from "../src/core/types.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

async function setupGuard(): Promise<{ guardPath: string; projectRoot: string }> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-guard-"))
  temporaryDirectories.push(projectRoot)
  const context: BuildContext = {
    assetsRoot: DEFAULT_ASSETS_ROOT,
    homeDir: path.join(projectRoot, "home"),
    projectRoot,
    scope: "project",
  }
  const artifacts = await buildArtifacts(["claude"], context)
  const guard = artifacts.find((artifact) => artifact.kind === "policy" && artifact.name === "ms-agent-guard")
  if (!guard) throw new Error("No se genero el guard de Claude")
  await mkdir(path.dirname(guard.destination), { recursive: true })
  await writeFile(guard.destination, guard.content)
  return { guardPath: guard.destination, projectRoot }
}

function runGuard(
  guardPath: string,
  projectRoot: string,
  agent: string,
  payload: Record<string, unknown>,
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [guardPath, agent], { cwd: projectRoot })
    let stderr = ""
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, stderr }))
    child.stdin.end(JSON.stringify(payload))
  })
}

describe("Claude permission guard", () => {
  it("blocks secrets but permits example environment files", async () => {
    const { guardPath, projectRoot } = await setupGuard()

    const blockedRead = await runGuard(guardPath, projectRoot, "ms-scout", {
      tool_name: "Read",
      tool_input: { file_path: path.join(projectRoot, ".env") },
    })
    const blockedVariant = await runGuard(guardPath, projectRoot, "ms-scout", {
      tool_name: "Read",
      tool_input: { file_path: path.join(projectRoot, ".env.secret") },
    })
    const blockedGlob = await runGuard(guardPath, projectRoot, "ms-scout", {
      tool_name: "Glob",
      tool_input: { pattern: "**/.env*" },
    })
    const allowedRead = await runGuard(guardPath, projectRoot, "ms-scout", {
      tool_name: "Read",
      tool_input: { file_path: path.join(projectRoot, ".env.example") },
    })
    const blockedShell = await runGuard(guardPath, projectRoot, "ms-tester", {
      tool_name: "Bash",
      tool_input: { command: "cat .env" },
    })
    const blockedEnvironmentDump = await runGuard(guardPath, projectRoot, "ms-tester", {
      tool_name: "Bash",
      tool_input: { command: "/usr/bin/env" },
    })
    const blockedSecretGlob = await runGuard(guardPath, projectRoot, "ms-scout", {
      tool_name: "Bash",
      tool_input: { command: "cat .e*" },
    })
    const allowedShell = await runGuard(guardPath, projectRoot, "ms-tester", {
      tool_name: "Bash",
      tool_input: { command: "pnpm lint" },
    })
    const allowedEnvironmentText = await runGuard(guardPath, projectRoot, "ms-scout", {
      tool_name: "Bash",
      tool_input: { command: "grep env README.md" },
    })

    expect(blockedRead.code).toBe(2)
    expect(blockedRead.stderr).toContain("ruta sensible")
    expect(blockedVariant.code).toBe(2)
    expect(blockedGlob.code).toBe(2)
    expect(allowedRead.code).toBe(0)
    expect(blockedShell.code).toBe(2)
    expect(blockedEnvironmentDump.code).toBe(2)
    expect(blockedSecretGlob.code).toBe(2)
    expect(allowedShell.code).toBe(0)
    expect(allowedEnvironmentText.code).toBe(0)
  })

  it("blocks direct shell mutations for read-only agents", async () => {
    const { guardPath, projectRoot } = await setupGuard()
    const blockedTouch = await runGuard(guardPath, projectRoot, "ms-scout", {
      tool_name: "Bash",
      tool_input: { command: "touch proof.txt" },
    })
    const blockedRedirect = await runGuard(guardPath, projectRoot, "ms-scout", {
      tool_name: "Bash",
      tool_input: { command: "rg TODO > findings.txt" },
    })
    const blockedBranch = await runGuard(guardPath, projectRoot, "ms-scout", {
      tool_name: "Bash",
      tool_input: { command: "git branch feature" },
    })
    const allowedSearch = await runGuard(guardPath, projectRoot, "ms-scout", {
      tool_name: "Bash",
      tool_input: { command: "rg 'TODO|FIXME' src" },
    })
    const allowedBranch = await runGuard(guardPath, projectRoot, "ms-scout", {
      tool_name: "Bash",
      tool_input: { command: "git branch --show-current" },
    })
    const writerShell = await runGuard(guardPath, projectRoot, "ms-codex", {
      tool_name: "Bash",
      tool_input: { command: "touch proof.txt" },
    })

    expect(blockedTouch.code).toBe(2)
    expect(blockedRedirect.code).toBe(2)
    expect(blockedBranch.code).toBe(2)
    expect(allowedSearch.code).toBe(0)
    expect(allowedBranch.code).toBe(0)
    expect(writerShell.code).toBe(0)
  })

  it("enforces the write scope of documentation agents", async () => {
    const { guardPath, projectRoot } = await setupGuard()
    const allowed = await runGuard(guardPath, projectRoot, "ms-designer", {
      tool_name: "Write",
      tool_input: { file_path: path.join(projectRoot, "docs/design/feature.md") },
    })
    const blocked = await runGuard(guardPath, projectRoot, "ms-designer", {
      tool_name: "Write",
      tool_input: { file_path: path.join(projectRoot, "src/index.ts") },
    })

    expect(allowed.code).toBe(0)
    expect(blocked.code).toBe(2)
    expect(blocked.stderr).toContain("fuera del alcance")
  })
})
