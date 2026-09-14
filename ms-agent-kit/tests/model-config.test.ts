import { execFile } from "node:child_process"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import YAML from "yaml"
import { afterEach, describe, expect, it } from "vitest"
import { buildArtifacts } from "../src/adapters/index.js"
import { DEFAULT_ASSETS_ROOT } from "../src/core/catalog.js"
import { parseMarkdown } from "../src/core/frontmatter.js"
import { loadKitConfiguration, validateKitConfiguration } from "../src/core/kit-config.js"
import { resolveAgentModel, resolvedModels } from "../src/core/agent-models.js"
import { AGENT_DEFINITIONS } from "../src/core/agent-catalog.js"
import { initializeProjectContext } from "../src/core/project-context.js"
import { openCodeRolePermission } from "../src/core/opencode-role-permissions.js"
import type { Artifact, BuildContext } from "../src/core/types.js"

const roots: string[] = []
const run = promisify(execFile)
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

async function fixture(): Promise<BuildContext> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "ms-model-config-"))
  roots.push(projectRoot)
  return { projectRoot, homeDir: path.join(projectRoot, "home"), assetsRoot: DEFAULT_ASSETS_ROOT, scope: "project" }
}

async function configuration(context: BuildContext, content: string): Promise<void> {
  await mkdir(path.join(context.homeDir, ".ms-agent-kit"), { recursive: true })
  await writeFile(path.join(context.homeDir, ".ms-agent-kit/config.yaml"), content)
}

function artifact(artifacts: Artifact[], target: string, kind: string, name: string): Artifact {
  const result = artifacts.find((item) => item.target === target && item.kind === kind && item.name === name)
  if (!result) throw new Error(`Falta ${target}/${kind}/${name}`)
  return result
}

function guard(guardPath: string, agent: string, cwd: string, payload: unknown): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [guardPath, agent], { cwd, timeout: 300_000 }, (error, _stdout, stderr) => resolve({ code: error ? Number(error.code) || 1 : 0, stderr }))
    child.stdin!.end(JSON.stringify(payload))
  })
}

describe("configuración de modelos y preferencias por cliente", () => {
  it("aísla el override por agente y cliente sin mutar defaults", () => {
    const before = resolvedModels(["opencode", "claude", "codex"])
    const config = validateKitConfiguration({ schemaVersion: 1, models: { "ms-codex": { opencode: { model: "openai/gpt-6-astra", reasoningEffort: "high" } } } })
    for (const target of ["opencode", "claude", "codex"] as const) {
      for (const name of Object.keys(AGENT_DEFINITIONS)) {
        if (name === "ms-codex" && target === "opencode") {
          expect(resolveAgentModel(name, target, config)).toMatchObject({ model: "openai/gpt-6-astra", reasoningEffort: "high", modelSource: "override", reasoningEffortSource: "override", availability: "unchecked" })
        } else expect(resolveAgentModel(name, target, config)).toEqual(before[target]![name])
      }
    }
    resolveAgentModel("ms-codex", "opencode").reasoningEffort = "low"
    expect(resolvedModels(["opencode", "claude", "codex"], validateKitConfiguration({ schemaVersion: 1, models: {} }))).toEqual(before)
    for (const model of ["bad\nmodel", "bad model", `sk-${"a".repeat(30)}`]) expect(() => validateKitConfiguration({ schemaVersion: 1, models: { "ms-codex": { codex: { model } } } })).toThrow()
  })

  it("resuelve modelo y esfuerzo de forma independiente y conserva la herencia", () => {
    const config = validateKitConfiguration({ schemaVersion: 1, models: {
      "ms-codex": { claude: { model: "sonnet" }, codex: { reasoningEffort: "low" } },
      "ms-writer": { opencode: { model: "provider/writer" } },
    } })
    expect(resolveAgentModel("ms-codex", "claude", config)).toMatchObject({ model: "sonnet", modelSource: "override", reasoningEffort: null, reasoningEffortSource: "inherited" })
    expect(resolveAgentModel("ms-codex", "codex", config)).toMatchObject({ model: null, modelSource: "inherited", reasoningEffort: "low", reasoningEffortSource: "override" })
    expect(resolveAgentModel("ms-writer", "opencode", config)).toMatchObject({ model: "provider/writer", reasoningEffort: "medium", reasoningEffortSource: "default" })
  })

  it.each(["strong", "balanced", "light", "fast"])("rechaza explícitamente el perfil antiguo %s", (legacy) => {
    expect(() => validateKitConfiguration({ schemaVersion: 1, models: { "ms-codex": {}, [legacy]: {} } })).toThrow("usa nombres de agentes ms-*")
  })

  it.each([["low"], { value: "low" }, 1, null])("rechaza esfuerzo que no es string: %j", (reasoningEffort) => {
    expect(() => validateKitConfiguration({ schemaVersion: 1, models: { "ms-codex": { codex: { reasoningEffort } } } })).toThrow("reasoningEffort no admitido")
  })

  it.each(["schemaVersion: 2\nmodels: {}", "schemaVersion: 1\nmodels: {other: {}}", "schemaVersion: 1\nmodels: {ms-codex: {other: {}}}", "schemaVersion: 1\nmodels: {ms-codex: {codex: {unknown: true}}}", "schemaVersion: 1\nmodels: {ms-codex: {codex: {model: ''}}}", "schemaVersion: 1\nmodels: {ms-codex: {codex: {reasoningEffort: max}}}", "a: &a []\nb: *a", "[bad", "#".repeat(65537)])("rechaza configuración inválida", async (content) => {
    const context = await fixture()
    await configuration(context, content)
    await expect(loadKitConfiguration(context.homeDir)).rejects.toBeDefined()
    await expect(buildArtifacts(["codex"], context)).rejects.toBeDefined()
  })

  it("rechaza symlinks y conserva ausencia como defaults", async () => {
    const context = await fixture()
    expect(await loadKitConfiguration(context.homeDir)).toBeNull()
    await mkdir(context.homeDir)
    await symlink(context.projectRoot, path.join(context.homeDir, ".ms-agent-kit"))
    await expect(loadKitConfiguration(context.homeDir)).rejects.toMatchObject({ code: "STATE_INVALID" })
    const other = await fixture()
    expect((await buildArtifacts(["codex"], { ...other, projectRoot: path.join(other.projectRoot, "not-created") })).length).toBeGreaterThan(0)
  })

  it("materializa campos nativos en los tres clientes y --home en JSON de plan", async () => {
    const context = await fixture()
    await configuration(context, YAML.stringify({ schemaVersion: 1, models: { "ms-codex": { opencode: { model: "provider/model", reasoningEffort: "low" }, claude: { model: "sonnet", reasoningEffort: "medium" }, codex: { model: "custom-codex", reasoningEffort: "low" } } } }))
    const artifacts = await buildArtifacts(["opencode", "claude", "codex"], context)
    expect(parseMarkdown(artifact(artifacts, "opencode", "agent", "ms-codex").content.toString()).frontmatter).toMatchObject({ model: "provider/model", variant: "low" })
    expect(parseMarkdown(artifact(artifacts, "claude", "agent", "ms-codex").content.toString()).frontmatter).toMatchObject({ model: "sonnet", effort: "medium" })
    expect(artifact(artifacts, "codex", "agent", "ms-codex").content.toString()).toContain('model = "custom-codex"')
    expect(artifact(artifacts, "codex", "agent", "ms-codex").content.toString()).toContain('model_reasoning_effort = "low"')
    expect(artifact(artifacts, "codex", "agent", "ms-fastlane").content.toString()).not.toContain('\nmodel = ')
    const result = await run(process.execPath, ["--import", "tsx", path.resolve("src/cli.ts"), "plan", "--home", context.homeDir, "--project", context.projectRoot, "--target", "codex", "--json"], { timeout: 300_000 })
    const plan = JSON.parse(result.stdout)
    expect(Object.keys(plan.models.codex).sort()).toEqual(Object.keys(AGENT_DEFINITIONS).sort())
    expect(plan).toMatchObject({ statePath: expect.any(String), items: expect.any(Array), models: { codex: { "ms-codex": { model: "custom-codex", modelSource: "override" } } } })
  })

  it("materializa rutas documentales solo para writer y scope project, con guard efectivo", async () => {
    const context = await fixture()
    const initial = await initializeProjectContext(context.projectRoot)
    initial.project.preferences = { documentation: { language: "en", paths: ["documentation/guides"] }, technicalSkills: ["project-react"] }
    await writeFile(initial.path, YAML.stringify(initial.project))
    const artifacts = await buildArtifacts(["opencode", "claude", "codex"], context)
    expect(parseMarkdown(artifact(artifacts, "opencode", "agent", "ms-writer").content.toString()).frontmatter.permission).toMatchObject({ edit: { "documentation/guides/*.md": "allow", "documentation/guides/**/*.md": "allow" } })
    const editRules = (parseMarkdown(artifact(artifacts, "opencode", "agent", "ms-writer").content.toString()).frontmatter.permission as { edit: Record<string, string> }).edit
    const effectiveEdit = (filePath: string): string | undefined => Object.entries(editRules).filter(([pattern]) => new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(filePath)).at(-1)?.[1]
    expect(effectiveEdit("documentation/guides/readme.md")).toBe("allow")
    expect(effectiveEdit("documentation/guides/secrets/key.md")).toBe("deny")
    expect(effectiveEdit("documentation/guides/private.key")).toBe("deny")
    expect(artifact(artifacts, "codex", "agent", "ms-writer").content.toString()).toContain('"documentation/guides/**" = "write"')
    expect(artifact(artifacts, "codex", "agent", "ms-writer").content.toString()).toContain("escribe únicamente archivos Markdown")
    const guardArtifact = artifact(artifacts, "claude", "policy", "ms-agent-guard")
    const guardPath = path.join(context.projectRoot, "guard.mjs")
    await writeFile(guardPath, guardArtifact.content)
    expect((await guard(guardPath, "ms-writer", context.projectRoot, { tool_name: "Write", tool_input: { file_path: "documentation/guides/readme.md" } })).code).toBe(0)
    for (const [agent, filePath] of [["ms-writer", "documentation/guides/script.ts"], ["ms-writer", "documentation/guides/secrets/key.md"], ["ms-tester", "documentation/guides/readme.md"]]) expect((await guard(guardPath, agent!, context.projectRoot, { tool_name: "Write", tool_input: { file_path: filePath } })).code).toBe(2)
    for (const [agent, command, code] of [["ms-architect", "ms-agent-kit project inspect --json", 0], ["ms-architect", "ms-agent-kit project init --json", 2], ["ms-tester", "ms-agent-kit project init --json", 2], ["ms-codex", "ms-agent-kit project init --json", 0]] as const) expect((await guard(guardPath, agent, context.projectRoot, { tool_name: "Bash", tool_input: { command } })).code).toBe(code)
    for (const item of await buildArtifacts(["opencode", "claude", "codex"], { ...context, scope: "user", projectPreferences: initial.project.preferences })) {
      expect(item.content.toString()).not.toContain("project-react")
      expect(item.content.toString()).not.toContain("documentation/guides")
    }
  })

  it("habilita skills técnicas conservando prohibiciones y distingue fastlane de status", async () => {
    const context = await fixture()
    const artifacts = await buildArtifacts(["opencode", "claude", "codex"], context)
    for (const name of ["ms-codex", "ms-fastlane", "ms-tester"]) {
      expect(openCodeRolePermission(name).skill).toMatchObject({ "*": "allow", "ms-architect": "deny", "ms-project-init": "deny", "ms-handoff": "deny" })
      const claude = parseMarkdown(artifact(artifacts, "claude", "agent", name).content.toString()).frontmatter
      expect(claude.tools).toContain("Skill")
      expect(claude.disallowedTools).toEqual(expect.arrayContaining(["Skill(ms-architect)", "Skill(ms-architect *)", "Agent"]))
      expect(artifact(artifacts, "codex", "agent", name).content.toString()).toContain("Puedes cargar skills técnicas seleccionadas")
    }
    expect(parseMarkdown(artifact(artifacts, "claude", "command", "ms-fastlane").content.toString()).frontmatter).toMatchObject({ context: "fork", agent: "ms-fastlane", hooks: { Stop: expect.any(Array), PreToolUse: expect.any(Array) } })
    const claudeHandoff = artifact(artifacts, "claude", "command", "ms-handoff").content.toString()
    expect(claudeHandoff).toContain("devuelve contenido y destino al padre")
    expect(claudeHandoff).toContain("No crees subagentes anidados")
    expect(claudeHandoff).toContain("no afirmes que se guardó sin evidencia")
    expect(artifact(artifacts, "codex", "command", "ms-fastlane").content.toString()).toContain("Ejecuta directamente el cambio acotado autorizado")
    expect(artifact(artifacts, "codex", "command", "ms-fastlane").content.toString()).not.toContain("flujo de trabajo de solo lectura")
    expect(artifact(artifacts, "codex", "command", "ms-status").content.toString()).toContain("flujo de trabajo de solo lectura")
    for (const role of ["ms-architect", "ms-tester", "ms-scout"]) expect(openCodeRolePermission(role).bash).toMatchObject({ "ms-agent-kit project inspect *": "allow", "ms-agent-kit project init *": "deny" })
    expect(openCodeRolePermission("ms-codex").bash).toMatchObject({ "ms-agent-kit project init *": "allow" })
  })
})
