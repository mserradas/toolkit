import { execFile, execFileSync } from "node:child_process"
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, it } from "vitest"
import { buildArtifacts } from "../src/adapters/index.js"
import { DEFAULT_ASSETS_ROOT } from "../src/core/catalog.js"
import { applyPlan } from "../src/core/installer.js"
import { createPlan } from "../src/core/planner.js"
import type { Artifact, BuildContext } from "../src/core/types.js"

const execFileAsync = promisify(execFile)
const temporaryDirectories: string[] = []
const codexAvailable = (() => {
  try {
    execFileSync("codex", ["--version"], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
})()

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

async function testContext(): Promise<BuildContext> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-codex-policy-"))
  temporaryDirectories.push(projectRoot)
  return {
    assetsRoot: DEFAULT_ASSETS_ROOT,
    homeDir: path.join(projectRoot, "home"),
    projectRoot,
    scope: "project",
  }
}

function policyArtifact(artifacts: Artifact[]): Artifact {
  const artifact = artifacts.find(
    (candidate) => candidate.target === "codex" && candidate.kind === "policy" && candidate.name === "ms-secrets",
  )
  if (!artifact) throw new Error("Falta el artefacto ms-secrets")
  return artifact
}

describe("Codex hardening", () => {
  it("generates native web search settings without exposing ms-shared as a skill", async () => {
    const artifacts = await buildArtifacts(["codex"], await testContext())
    const agents = artifacts.filter((artifact) => artifact.kind === "agent")

    expect(agents).toHaveLength(12)
    expect(agents.every((artifact) => artifact.content.includes('web_search = "'))).toBe(true)
    expect(artifacts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "skill", name: "ms-shared" })]),
    )
    expect(policyArtifact(artifacts).content.toString("utf8")).toContain(
      "Protección práctica (no absoluta)",
    )
  })

  it.skipIf(!codexAvailable)("blocks the practical secret matrix without blocking safe files", async () => {
    const context = await testContext()
    const policy = policyArtifact(await buildArtifacts(["codex"], context))
    await mkdir(path.dirname(policy.destination), { recursive: true })
    await writeFile(policy.destination, policy.content, { mode: policy.mode })
    const cases = [
      { args: ["cat", ".env"], forbidden: true },
      { args: ["cat", ".env.secret"], forbidden: true },
      { args: ["head", "-c", "50", ".env"], forbidden: true },
      { args: ["head", "-5", ".env"], forbidden: true },
      { args: ["sed", "-n", "1p", ".env"], forbidden: true },
      { args: ["sed", "-n", "2p", ".env"], forbidden: true },
      { args: ["awk", "/DATABASE_URL/", ".env"], forbidden: true },
      { args: ["rg", "DATABASE_URL", ".env"], forbidden: true },
      { args: ["rg", "-n", "TOKEN", ".env.secret"], forbidden: true },
      { args: ["grep", "DATABASE_URL", ".env"], forbidden: true },
      { args: ["grep", "-n", "PASSWORD", ".env"], forbidden: true },
      { args: ["rg", "TOKEN", ".env.secret"], forbidden: true },
      { args: ["grep", "PASSWORD", ".env.production"], forbidden: true },
      { args: ["awk", "{print}", ".netrc"], forbidden: true },
      { args: ["head", "-n", "1", ".npmrc"], forbidden: true },
      { args: ["git", "show", "HEAD:.env"], forbidden: true },
      { args: ["cat", ".env.example"], forbidden: false },
      { args: ["cat", "README.md"], forbidden: false },
      { args: ["sed", "-n", "1p", "README.md"], forbidden: false },
      { args: ["rg", "TOKEN", ".env.example"], forbidden: false },
      { args: ["head", "-c", "50", ".env.example"], forbidden: false },
      { args: ["rg", "-n", "TOKEN", ".env.example"], forbidden: false },
      { args: ["grep", "-n", "PASSWORD", "README.md"], forbidden: false },
      { args: ["git", "show", "HEAD:.env.example"], forbidden: false },
    ] as const

    for (const testCase of cases) {
      const { stdout } = await execFileAsync("codex", [
        "execpolicy",
        "check",
        "--rules",
        policy.destination,
        "--",
        ...testCase.args,
      ])
      const result = JSON.parse(stdout) as { decision?: string }
      expect(result.decision === "forbidden", testCase.args.join(" ")).toBe(testCase.forbidden)
    }
  })

  it("makes doctor execute the complete matrix and fail when one case is wrong", async () => {
    const context = await testContext()
    const artifacts = await buildArtifacts(["codex"], context)
    await applyPlan(await createPlan(artifacts, context), context)

    const fakeBin = path.join(context.projectRoot, "fake-bin")
    const fakeCodex = path.join(fakeBin, "codex")
    const callsPath = path.join(context.projectRoot, "codex-calls.jsonl")
    await mkdir(fakeBin, { recursive: true })
    await writeFile(
      fakeCodex,
      `#!/usr/bin/env node
const fs = require("node:fs")
const args = process.argv.slice(2)
const separator = args.indexOf("--")
const command = args.slice(separator + 1)
fs.appendFileSync(process.env.FAKE_CODEX_CALLS, JSON.stringify(command) + "\\n")
const safe = command.some((value) => value.endsWith(".env.example") || value.endsWith("README.md"))
const forcedFailure = JSON.stringify(command) === process.env.FAKE_CODEX_FAIL
const forbidden = forcedFailure ? !safe : !safe
const decision = forcedFailure ? (forbidden ? undefined : "forbidden") : (forbidden ? "forbidden" : undefined)
process.stdout.write(JSON.stringify(decision ? { decision } : {}))
`,
      { mode: 0o755 },
    )
    await chmod(fakeCodex, 0o755)
    const cliArgs = [
      "--import",
      "tsx",
      path.join(process.cwd(), "src", "cli.ts"),
      "doctor",
      "--target",
      "codex",
      "--scope",
      "project",
      "--project",
      context.projectRoot,
      "--home",
      context.homeDir,
      "--assets",
      DEFAULT_ASSETS_ROOT,
      "--json",
    ]
    const baseEnv = {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
      FAKE_CODEX_CALLS: callsPath,
    }
    const { stdout } = await execFileAsync(process.execPath, cliArgs, { env: baseEnv })
    const payload = JSON.parse(stdout) as {
      ok: boolean
      security: { codexSecretRules: { status: string; detail: string } }
    }
    expect(payload.ok).toBe(true)
    expect(payload.security.codexSecretRules).toEqual(
      expect.objectContaining({ status: "passed", detail: expect.stringContaining("28/28") }),
    )

    const calls = (await readFile(callsPath, "utf8")).trim().split("\n").map(JSON.parse)
    expect(calls).toHaveLength(28)
    expect(calls).toContainEqual(["cat", ".env.secret"])
    expect(calls).toContainEqual(["rg", "-n", "TOKEN", ".env.secret"])
    expect(calls).toContainEqual(["rg", "-n", "TOKEN", ".env.example"])

    await expect(
      execFileAsync(process.execPath, cliArgs, {
        env: { ...baseEnv, FAKE_CODEX_FAIL: JSON.stringify(["cat", ".env.secret"]) },
      }),
    ).rejects.toMatchObject({ code: 1 })
  })
})
