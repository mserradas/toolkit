import { mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildArtifacts } from "../src/adapters/index.js"
import { DEFAULT_ASSETS_ROOT } from "../src/core/catalog.js"
import { validateKitConfiguration } from "../src/core/kit-config.js"
import { getProjectVerification, verificationOutputPaths } from "../src/core/verification-policy.js"
import type { Artifact, BuildContext } from "../src/core/types.js"

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })
const commands = ["make verify", "docker compose -f compose.test.yml run --rm tests", "pnpm test:unit", "./scripts/test.sh", "npm test"]
const outputPaths = ["coverage", "packages/api/test-results", "node_modules/.cache", "node_modules/.vite"]
async function fixture(): Promise<BuildContext> {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "ms-verification-")))
  roots.push(root)
  return { projectRoot: root, homeDir: path.join(root, "home"), assetsRoot: DEFAULT_ASSETS_ROOT, scope: "project", kitConfiguration: { schemaVersion: 1, models: {}, verification: { projects: [{ root, commands: [...commands], outputPaths: [...outputPaths] }] } } }
}
const configuration = (project: unknown) => ({ schemaVersion: 1, models: {}, verification: { projects: [project] } })
function artifact(artifacts: Artifact[], target: string, name: string) {
  const result = artifacts.find((item) => item.target === target && item.name === name && (item.kind === "agent" || item.kind === "policy"))
  if (!result) throw new Error("Falta artefacto")
  return result.content.toString()
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

  it("keeps optional result directory guidance for verification roles", async () => {
    const context = { ...await fixture(), scope: "user" as const }
    expect(verificationOutputPaths("ms-tester", context)).toContain("coverage")
    expect(verificationOutputPaths("ms-scout", context)).toEqual([])
  })

  it("includes reviewed project verification as guidance without access grants", async () => {
    const context = await fixture()
    const artifacts = await buildArtifacts(["opencode", "claude", "codex"], context)
    for (const target of ["opencode", "claude", "codex"]) {
      for (const role of ["ms-codex", "ms-fastlane", "ms-tester"]) {
        const content = artifact(artifacts, target, role)
        expect(content).toContain("Verificación del proyecto")
        expect(content).toContain("make verify")
        expect(content).toContain("packages/api/test-results")
        expect(content).toContain("no son una lista de permisos")
      }
      expect(artifact(artifacts, target, "ms-scout")).not.toContain("Verificación del proyecto")
    }
    const user = await buildArtifacts(["opencode", "claude", "codex"], { ...context, scope: "user" })
    for (const target of ["opencode", "claude", "codex"]) expect(artifact(user, target, "ms-tester")).not.toContain("Verificación del proyecto")
  })


})
