import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildArtifacts } from "../src/adapters/index.js"
import { AGENT_DEFINITIONS } from "../src/core/agent-catalog.js"
import { DEFAULT_ASSETS_ROOT } from "../src/core/catalog.js"
import { parseMarkdown } from "../src/core/frontmatter.js"
import { modelConfigurationDiagnostics } from "../src/core/model-diagnostics.js"
import type { KitConfiguration } from "../src/core/kit-config.js"
import { TARGETS, type BuildContext, type InstallPlan, type Target } from "../src/core/types.js"

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

async function fixture(configuration?: KitConfiguration) {
  const root = await mkdtemp(path.join(tmpdir(), "ms-model-diagnostics-"))
  roots.push(root)
  const context: BuildContext = { assetsRoot: DEFAULT_ASSETS_ROOT, homeDir: path.join(root, "home"), projectRoot: root, scope: "project" }
  if (configuration) context.kitConfiguration = configuration
  const artifacts = await buildArtifacts([...TARGETS], context)
  // Snapshot sintético de hashes; no acredita una instalación real ni una sesión.
  const plan: InstallPlan = {
    items: artifacts.map((artifact) => {
      const hash = createHash("sha256").update(artifact.content).digest("hex")
      return { artifact, action: "unchanged", reason: "fixture", currentHash: hash, desiredHash: hash }
    }),
    obsolete: [], statePath: path.join(root, "state.json"), stateDir: root,
  }
  const managed = artifacts.map((artifact) => ({ target: artifact.target, path: artifact.destination, status: "ok" as "ok" | "modified" | "missing" }))
  return { context, artifacts, plan, managed }
}

describe("configuración observable de modelos", () => {
  it("preserves reasoning without introducing a kit turn budget", async () => {
    const { context, plan, managed, artifacts } = await fixture()
    const content = (target: Target) => artifacts.find((item) => item.target === target && item.name === "ms-codex" && item.kind === "agent")!.content.toString()
    expect(parseMarkdown(content("opencode")).frontmatter).toMatchObject({ variant: "high" })
    expect(parseMarkdown(content("opencode")).frontmatter).not.toHaveProperty("steps")
    expect(parseMarkdown(content("claude")).frontmatter).not.toHaveProperty("maxTurns")
    expect(content("codex")).not.toContain("Presupuesto operativo objetivo")
    expect(content("codex")).toContain('model_reasoning_effort = "high"')
    for (const row of modelConfigurationDiagnostics([...TARGETS], plan, managed, context.homeDir)) {
      for (const section of [row.declared, row.installed, row.effective]) expect(section).not.toHaveProperty("budget")
    }
  })

  it("separa hashes coincidentes de ajustes efectivos desconocidos", async () => {
    const { context, plan, managed } = await fixture()
    const rows = modelConfigurationDiagnostics([...TARGETS], plan, managed, context.homeDir)
    expect(rows).toHaveLength(Object.keys(AGENT_DEFINITIONS).length * TARGETS.length)
    expect(rows.find((row) => row.target === "opencode" && row.role === "ms-codex")).toMatchObject({
      declared: { model: "openai/gpt-5.6-sol", reasoningEffort: "high", modelSource: "src/core/agent-catalog.ts#ms-codex" },
      installed: { status: "comprobado", model: "openai/gpt-5.6-sol", reasoningEffort: "high", source: expect.stringContaining("ms-codex.md") },
    })
    for (const row of rows) expect(row.effective).toMatchObject({ status: "no comprobado", model: null, reasoningEffort: null, source: null })
    expect(JSON.stringify(rows)).not.toContain("developer_instructions")
    for (const row of rows) expect(row).not.toHaveProperty("profile")
  })

  it("preserva overrides con fuente sin aplicarlos al arquitecto Codex como skill", async () => {
    const configuration: KitConfiguration = { schemaVersion: 1, models: { "ms-codex": { codex: { model: "custom-model", reasoningEffort: "low" } }, "ms-architect": { codex: { model: "architect-declared", reasoningEffort: "medium" } } } }
    const { context, plan, managed } = await fixture(configuration)
    const rows = modelConfigurationDiagnostics(["codex"], plan, managed, context.homeDir, configuration)
    expect(rows.find((row) => row.role === "ms-codex")).toMatchObject({
      declared: { model: "custom-model", reasoningEffort: "low", modelSource: path.join(context.homeDir, ".ms-agent-kit/config.yaml") },
      installed: { model: "custom-model", reasoningEffort: "low" },
    })
    const architect = rows.find((row) => row.role === "ms-architect")!
    expect(architect).toMatchObject({ materialization: "main-task", declared: { appliesToAgent: false, model: "architect-declared", reasoningEffort: "medium" }, installed: { status: "comprobado", model: null, reasoningEffort: null } })
    expect(architect.installed.detail).toContain("heredan la tarea principal")
    expect(architect.effective.status).toBe("no comprobado")
  })

  it.each(["modified", "missing", "unmanaged", "different", "update", "absent"])("no infiere valores instalados para %s", async (state) => {
    const { context, plan, managed } = await fixture()
    const item = plan.items.find((entry) => entry.artifact.target === "opencode" && entry.artifact.name === "ms-codex" && entry.artifact.kind === "agent")!
    const record = managed.find((entry) => entry.path === item.artifact.destination)!
    if (state === "modified" || state === "missing") record.status = state
    if (state === "unmanaged") managed.splice(managed.indexOf(record), 1)
    if (state === "different") item.currentHash = "different-hash"
    if (state === "update") item.action = "update"
    if (state === "absent") plan.items.splice(plan.items.indexOf(item), 1)
    const row = modelConfigurationDiagnostics(["opencode"], plan, managed, context.homeDir).find((entry) => entry.role === "ms-codex")!
    expect(row.installed).toMatchObject({ status: "no comprobado", model: null, reasoningEffort: null })
    expect(row.declared.model).toBe("openai/gpt-5.6-sol")
    expect(row.effective.status).toBe("no comprobado")
  })

  it("conserva desconocidos cuando no hay plan válido", () => {
    const rows = modelConfigurationDiagnostics(["claude"], null, [], "/synthetic-home")
    expect(rows.every((row) => row.installed.status === "no comprobado" && row.installed.source === null)).toBe(true)
    expect(rows.find((row) => row.role === "ms-codex")?.declared).toMatchObject({ model: null, reasoningEffort: null, modelSource: "tarea principal del cliente" })
  })

  it("doctor publica overrides declarados y valores instalados desconocidos sin instalación", async () => {
    const { context } = await fixture()
    await mkdir(path.join(context.homeDir, ".ms-agent-kit"), { recursive: true })
    await writeFile(path.join(context.homeDir, ".ms-agent-kit/config.yaml"), JSON.stringify({ schemaVersion: 1, models: { "ms-codex": { opencode: { model: "provider/local-test", reasoningEffort: "low" } } } }))
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "doctor", "--target", "opencode", "--scope", "project", "--project", context.projectRoot, "--home", context.homeDir, "--json"], { encoding: "utf8", env: { ...process.env, PATH: "" }, timeout: 300_000 })
    expect(result.error).toBeUndefined()
    expect([0, 1]).toContain(result.status)
    const payload = JSON.parse(result.stdout)
    expect(payload.modelConfiguration.find((row: { role: string }) => row.role === "ms-codex")).toMatchObject({
      declared: { model: "provider/local-test", reasoningEffort: "low", modelSource: path.join(context.homeDir, ".ms-agent-kit/config.yaml") },
      installed: { status: "no comprobado", model: null, reasoningEffort: null },
      effective: { status: "no comprobado", model: null, reasoningEffort: null },
    })
  })
})
