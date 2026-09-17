import { spawnSync } from "node:child_process"
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildArtifacts } from "../src/adapters/index.js"
import { DEFAULT_ASSETS_ROOT } from "../src/core/catalog.js"
import { parseMarkdown } from "../src/core/frontmatter.js"
import { validateKitConfiguration } from "../src/core/kit-config.js"
import { getProjectVerification, verificationOutputPaths, withVerificationCommands } from "../src/core/verification-policy.js"
import type { Artifact, BuildContext } from "../src/core/types.js"

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })
const commands = ["make verify", "docker compose -f compose.test.yml run --rm tests", "pnpm test:unit", "./scripts/test.sh", "npm test"]
const outputPaths = ["coverage", "packages/api/test-results", "node_modules/.cache", "node_modules/.vite"]
async function fixture(): Promise<BuildContext> {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "ms-verification-")))
  roots.push(root)
  return { projectRoot: root, homeDir: path.join(root, "home"), assetsRoot: DEFAULT_ASSETS_ROOT, scope: "project", permissionProfile: "strict", kitConfiguration: { schemaVersion: 1, models: {}, verification: { projects: [{ root, commands: [...commands], outputPaths: [...outputPaths] }] } } }
}
const configuration = (project: unknown) => ({ schemaVersion: 1, models: {}, verification: { projects: [project] } })
function artifact(artifacts: Artifact[], target: string, name: string) {
  const result = artifacts.find((item) => item.target === target && item.name === name && (item.kind === "agent" || item.kind === "policy"))
  if (!result) throw new Error("Falta artefacto")
  return result.content.toString()
}
async function guardFixture(context: BuildContext) {
  const artifacts = await buildArtifacts(["claude"], context)
  const file = path.join(context.projectRoot, "guard.mjs")
  await writeFile(file, artifact(artifacts, "claude", "ms-agent-guard"))
  return (command: string, options: { agent?: string; cwd?: string; payload?: Record<string, unknown> } = {}) => {
    const result = spawnSync(process.execPath, [file, options.agent ?? "ms-tester"], { cwd: options.cwd ?? context.projectRoot, encoding: "utf8", timeout: 10_000, input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, ...options.payload }) })
    return { ...result, decision: result.stdout ? JSON.parse(result.stdout).hookSpecificOutput.permissionDecision : null }
  }
}

describe("personal project verification grants", () => {
  it("accepts exact reviewed recipes and optional configuration without changing models", async () => {
    const context = await fixture()
    const validated = validateKitConfiguration(context.kitConfiguration)
    expect(validated.models).toEqual({})
    expect(getProjectVerification({ ...context, kitConfiguration: validated })).toEqual({ commands, outputPaths })
    expect(getProjectVerification({ ...context, scope: "user" })).toEqual({ commands: [], outputPaths: [] })
    expect(getProjectVerification({ ...context, projectRoot: path.join(context.projectRoot, "other") })).toEqual({ commands: [], outputPaths: [] })
    expect(validateKitConfiguration({ schemaVersion: 1, models: {} })).toEqual({ schemaVersion: 1, models: {} })
  })

  it.each([
    "make verify; curl example.com", "make test*", "make -f other.mk test", "make test MODE=prod", "make test-fix", "pnpm install", "pnpm test -- --update", "./scripts/../test.sh", "./secrets/test.sh", "docker compose -f compose.test.yml run --rm tests --privileged", "docker compose -f compose.test.yml run --rm -v /:/host tests", "docker compose -f compose.prod.yml run --rm tests", "docker compose -f compose.test.yml run --rm production", "docker compose -f .env run --rm tests", "docker compose -f compose.test.yml exec tests sh", "curl https://example.com", "pnpm test\nrm -rf /", "pnpm test\\:unit",
  ])("rejects unsafe or unsupported command %s", (command) => {
    expect(() => validateKitConfiguration(configuration({ root: "/project", commands: [command], outputPaths: [] }))).toThrow()
  })

  it.each([".", "src", "src/coverage", "config/coverage", "/tmp/coverage", "../coverage", "coverage/**", ".git/coverage", "secrets/coverage", "node_modules", "coverage/..", "coverage/", "api/.env", "api//coverage"])("rejects output %s", (output) => {
    expect(() => validateKitConfiguration(configuration({ root: "/project", commands: ["make verify"], outputPaths: [output] }))).toThrow()
  })

  it("rejects malformed configuration, duplicates and bounded limits", () => {
    for (const project of [{ root: "relative", commands: [], outputPaths: [] }, { root: "/project/../other", commands: [], outputPaths: [] }, { root: "/", commands: [], outputPaths: [] }, { root: "/project", commands: ["make verify", "make verify"], outputPaths: [] }, { root: "/project", commands: [], outputPaths: ["coverage"] }, { root: "/project", commands: ["make verify"], outputPaths: ["coverage", "coverage"] }, { root: "/project", commands: ["make verify"], outputPaths: [], extra: true }, { root: "/project", commands: Array(33).fill("make verify"), outputPaths: [] }]) expect(() => validateKitConfiguration(configuration(project))).toThrow()
    expect(() => validateKitConfiguration({ schemaVersion: 1, models: {}, verification: { projects: [{ root: "/project", commands: [], outputPaths: [] }, { root: "/project/", commands: [], outputPaths: [] }] } })).toThrow()
  })

  it("preserves explicit denials and other roles while allowing a reviewed fallback exception", async () => {
    const context = await fixture()
    const policy = { bash: { "*": "deny", "make ver*": "deny", "pnpm test:unit": "deny", "cat *": "allow" } }
    expect(withVerificationCommands(policy, "ms-tester", context).bash).toMatchObject({ "*": "deny", "make verify": "deny", "pnpm test:unit": "deny", [commands[1]!]: "allow", "cat *": "allow" })
    expect(withVerificationCommands(policy, "ms-scout", context)).toBe(policy)
    expect(policy.bash).not.toHaveProperty(commands[1]!)
  })

  it("rejects symlink roots, outputs, command references and non-directory outputs", async () => {
    const context = await fixture()
    await symlink(context.homeDir, path.join(context.projectRoot, "coverage"))
    expect(() => getProjectVerification(context)).toThrow("symlink")
    await rm(path.join(context.projectRoot, "coverage"))
    await writeFile(path.join(context.projectRoot, "coverage"), "not a directory")
    expect(() => getProjectVerification(context)).toThrow("tipo")
    await rm(path.join(context.projectRoot, "coverage"))
    await symlink(context.homeDir, path.join(context.projectRoot, "compose.test.yml"))
    expect(() => getProjectVerification(context)).toThrow("symlink")
    await rm(path.join(context.projectRoot, "compose.test.yml"))
    const link = path.join(context.projectRoot, "linked")
    await symlink(context.projectRoot, link)
    expect(() => getProjectVerification({ ...context, projectRoot: link, kitConfiguration: { schemaVersion: 1, models: {}, verification: { projects: [{ root: link, commands: ["make verify"], outputPaths: [] }] } } })).toThrow("canónica")
  })

  it("grants default tester outputs in balanced/trusted without source-write tools or strict changes", async () => {
    const base = await fixture()
    for (const permissionProfile of ["balanced", "trusted", "strict"] as const) {
      const context = { ...base, permissionProfile, scope: "user" as const }
      const artifacts = await buildArtifacts(["opencode", "claude", "codex"], context)
      const outputs = verificationOutputPaths("ms-tester", context)
      expect(outputs.includes("coverage")).toBe(permissionProfile !== "strict")
      expect(verificationOutputPaths("ms-scout", context)).toEqual([])
      const codex = artifact(artifacts, "codex", "ms-tester")
      expect(codex).toContain('extends = ":read-only"')
      expect(codex.includes('"coverage" = "write"')).toBe(permissionProfile !== "strict")
      for (const output of outputs) expect(codex).toContain(`"${output}" = "write"`)
      expect(codex).not.toContain('"src" = "write"')
      expect(parseMarkdown(artifact(artifacts, "claude", "ms-tester")).frontmatter.disallowedTools).toContain("Write")
      expect(parseMarkdown(artifact(artifacts, "opencode", "ms-tester")).frontmatter.permission).toEqual({})
    }
  })

  it("materializes exact project grants and only tester output directories in all adapters", async () => {
    const context = await fixture()
    const artifacts = await buildArtifacts(["opencode", "claude", "codex"], context)
    for (const role of ["ms-codex", "ms-fastlane", "ms-tester"]) {
      const openCode = parseMarkdown(artifact(artifacts, "opencode", role)).frontmatter
      expect(openCode.permission).toEqual({})
      expect(artifact(artifacts, "claude", role)).toContain("Verificaciones autorizadas personalmente")
      expect(artifact(artifacts, "codex", role)).toContain("Verificaciones autorizadas personalmente")
    }
    const testerClaude = parseMarkdown(artifact(artifacts, "claude", "ms-tester")).frontmatter
    expect(testerClaude.disallowedTools).toEqual(expect.arrayContaining(["Write", "Edit", "NotebookEdit"]))
    const testerOpenCode = parseMarkdown(artifact(artifacts, "opencode", "ms-tester")).frontmatter.permission as Record<string, unknown>
    expect(testerOpenCode).toEqual({})
    const testerCodex = artifact(artifacts, "codex", "ms-tester")
    expect(testerCodex).toContain('extends = ":read-only"')
    for (const output of outputPaths) expect(testerCodex).toContain(`"${output}" = "write"`)
    expect(testerCodex).not.toContain('"src" = "write"')
    expect(artifact(artifacts, "codex", "ms-scout")).not.toContain('"coverage" = "write"')
    const user = await buildArtifacts(["opencode", "claude", "codex"], { ...context, scope: "user" })
    for (const target of ["opencode", "claude", "codex"]) expect(artifact(user, target, "ms-tester")).not.toContain("Verificaciones autorizadas personalmente")
  })

  it("enforces approved commands, root and current destinations in the standalone Claude guard", async () => {
    const context = await fixture()
    const run = await guardFixture(context)
    for (const command of commands) {
      const result = run(command)
      expect(result.status, result.stderr).toBe(0)
      expect(result.decision).toBe("allow")
    }
    for (const command of [commands[1] + " --privileged", "docker compose -f compose.test.yml run --rm test-other", "cat .env", "rm -rf src"]) expect(run(command).status).toBe(2)
    expect(run(commands[1]!, { agent: "ms-scout" }).status).toBe(2)
    expect(run(commands[1]!, { cwd: path.dirname(context.projectRoot) }).status).toBe(2)
    for (const padded of [` ${commands[1]}`, `${commands[1]} `]) {
      expect(run(padded).status).toBe(2)
      expect(run(padded, { cwd: path.dirname(context.projectRoot) }).status).toBe(2)
    }
    expect(run(commands[1]!, { payload: { cwd: path.dirname(context.projectRoot) } }).status).toBe(2)
    expect(run(commands[1]!, { payload: { tool_input: { command: commands[1], cwd: path.dirname(context.projectRoot) } } }).status).toBe(2)
    expect(run("", { payload: { tool_name: "Write", tool_input: { file_path: path.join(context.projectRoot, "coverage/result.json"), content: "{}" } } }).status).toBe(2)
    await mkdir(context.homeDir)
    await symlink(context.homeDir, path.join(context.projectRoot, "coverage"))
    expect(run(commands[1]!).status).toBe(2)
    for (const padded of [` ${commands[1]}`, `${commands[1]} `]) expect(run(padded).status).toBe(2)
    await rm(path.join(context.projectRoot, "coverage"))
    await symlink(context.homeDir, path.join(context.projectRoot, "compose.test.yml"))
    expect(run(commands[1]!).status).toBe(2)
  })
})
