import { execFile, spawn } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, it } from "vitest"
import { buildArtifacts } from "../src/adapters/index.js"
import { DEFAULT_ASSETS_ROOT } from "../src/core/catalog.js"
import { capabilityProfile, gitInspectionCommands } from "../src/core/profiles.js"

const roots: string[] = []
const execFileAsync = promisify(execFile)
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

function runGuard(guard: string, projectRoot: string, role: string, command: string, cwd = projectRoot): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [guard, role], { cwd: projectRoot })
    let stderr = ""
    child.stderr.on("data", (chunk) => { stderr += chunk.toString() })
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, stderr }))
    child.stdin.end(JSON.stringify({ cwd, tool_name: "Bash", tool_input: { command } }))
  })
}

describe("Claude documentary inspection guard", () => {
  it("accepts the shared closed list and rejects added operations, scope escapes and wrong cwd", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ms-git-inspection-"))
    roots.push(root)
    const artifacts = await buildArtifacts(["claude"], { assetsRoot: DEFAULT_ASSETS_ROOT, projectRoot: root, homeDir: path.join(root, "home"), scope: "project", permissionProfile: "strict" })
    const guard = artifacts.find((artifact) => artifact.kind === "policy" && artifact.name === "ms-agent-guard")!
    await mkdir(path.dirname(guard.destination), { recursive: true })
    await writeFile(guard.destination, guard.content)
    await mkdir(path.join(root, "nested"))
    expect((await runGuard(guard.destination, root, "ms-architect", "ms-agent-kit result validate --file result.md --json")).code).toBe(0)
    expect((await runGuard(guard.destination, root, "ms-architect", "command -v ms-agent-kit")).code).toBe(0)
    for (const command of ["ms-agent-kit result validate --file .env", "ms-agent-kit install --target codex", "ms-agent-kit result validate --file result.md && cat .env"]) {
      expect((await runGuard(guard.destination, root, "ms-architect", command)).code, command).not.toBe(0)
    }
    await execFileAsync("git", ["init", "--quiet"], { cwd: root })
    const simulatedSecret = "SYNTHETIC_TEST_VALUE_DO_NOT_DISCLOSE"
    for (const directory of ["design", "spec"]) {
      const secrets = path.join(root, ".agents/docs", directory, "secrets")
      await mkdir(secrets, { recursive: true })
      for (const filename of ["token.md", ".env"]) await writeFile(path.join(secrets, filename), "original fixture\n")
    }
    await execFileAsync("git", ["add", "--", ".agents/docs"], { cwd: root })
    for (const directory of ["design", "spec"]) {
      for (const filename of ["token.md", ".env"]) await writeFile(path.join(root, ".agents/docs", directory, "secrets", filename), `${simulatedSecret}  \n`)
    }
    for (const [role, profileName, directory] of [["ms-designer", "design-writer", "design"], ["ms-spec", "spec-writer", "spec"]] as const) {
      for (const probe of ["pwd", "ls -d .", "command -v ms-agent-kit"]) {
        expect((await runGuard(guard.destination, root, role, probe)).code, `${role}: ${probe}`).toBe(0)
        for (const cwd of [path.join(root, "nested"), path.dirname(root)]) expect((await runGuard(guard.destination, root, role, probe, cwd)).code, `${role}: ${probe}: ${cwd}`).not.toBe(0)
      }
      for (const command of ["pwd -P", "ls", "ls -d /repo", "ls -d ..", "ls -d . extra", "ls .env", "command -v node", "command -v ms-agent-kit extra", "command ms-agent-kit", "ls -d . && command -v ms-agent-kit", "pwd; pwd", "ls -d $(pwd)", "pwd > out", "sh -c pwd", "bash -c pwd", "env pwd"]) {
        expect((await runGuard(guard.destination, root, role, command)).code, `${role}: ${command}`).not.toBe(0)
      }
      for (const command of gitInspectionCommands(capabilityProfile(profileName))) {
        const result = await runGuard(guard.destination, root, role, command)
        expect(result.code, `${role}: ${command}: ${result.stderr}`).toBe(0)
        const [executable, ...args] = command.split(" ")
        const output = await execFileAsync(executable!, args, { cwd: root })
        expect(output.stdout + output.stderr, command).not.toContain(simulatedSecret)
        expect(output.stdout).toContain(command.includes("--stat") ? "files changed" : "secrets/")
      }
      for (const option of ["", " --check"]) {
        const command = `git --no-pager diff --no-ext-diff --no-textconv${option} -- .agents/docs/${directory}`
        expect((await runGuard(guard.destination, root, role, command)).code, command).not.toBe(0)
      }
      for (const command of ["git status", "git diff", "git diff -- src", "git reset --hard", "git status --short && cat .env", "cat .env", "ms-agent-kit project inspect", "git --no-pager diff --no-ext-diff --no-textconv -- .agents/docs/design/../spec", "git --no-pager diff --no-ext-diff --no-textconv --output=/tmp/leak -- .agents/docs/design"]) {
        const result = await runGuard(guard.destination, root, role, command)
        expect(result.code, `${role}: ${command}: ${result.stderr}`).not.toBe(0)
      }
      expect((await runGuard(guard.destination, root, role, "git status --short", path.join(root, "nested"))).code).not.toBe(0)
    }
  }, 30_000)
})
