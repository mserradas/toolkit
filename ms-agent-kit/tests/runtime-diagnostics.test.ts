import { spawnSync } from "node:child_process"
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { buildArtifacts } from "../src/adapters/index.js"
import { applyPlan } from "../src/core/installer.js"
import { createPlan } from "../src/core/planner.js"
import { DEFAULT_ASSETS_ROOT } from "../src/core/catalog.js"
import { initializeProjectContext } from "../src/core/project-context.js"
import { commandCapabilities, diagnoseClient, inspectRuntimeProject, installationCapabilities, probeOptions, projectContextDiagnostic, resolveClientExecutable, staticCommandDecision, type ProbeRunner } from "../src/core/runtime-diagnostics.js"
import type { BuildContext, InstallPlan, Target } from "../src/core/types.js"

const temporary: string[] = []
async function directory() {
  const root = await mkdtemp(path.join(tmpdir(), "ms-runtime-diagnostics-"))
  temporary.push(root)
  return root
}
async function executable(root: string, name: string, body = 'process.stdout.write("0.138.0\\n")') {
  const location = path.join(root, name)
  await writeFile(location, `#!${process.execPath}\n${body}\n`, { mode: 0o755 })
  await chmod(location, 0o755)
  return location
}
function context(root: string): BuildContext {
  return { projectRoot: root, homeDir: path.join(root, "home"), assetsRoot: DEFAULT_ASSETS_ROOT, scope: "project" }
}
afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("diagnóstico runtime seguro", () => {
  it("doctor accepts native permissions after install without probing removed Codex policies", async () => {
    const root = await directory()
    const binaryRoot = await directory()
    const buildContext = context(root)
    await executable(binaryRoot, "codex", 'if (process.argv.slice(2).join(" ") !== "--version") throw new Error("Unexpected policy probe"); process.stdout.write("codex-cli 0.138.0\\n")')
    await applyPlan(await createPlan(await buildArtifacts(["codex"], buildContext), buildContext), buildContext)
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "doctor", "--target", "codex", "--scope", "project", "--project", root, "--home", buildContext.homeDir, "--json"], { encoding: "utf8", env: { ...process.env, PATH: binaryRoot }, timeout: 300_000 })
    expect(result.status, result.stderr).toBe(0)
    const report = JSON.parse(result.stdout)
    expect(report).toMatchObject({ ok: true, security: { permissions: "native", effective: "no comprobado" }, warnings: [] })
    expect(report.security).not.toHaveProperty("codexSecretRules")
  })

  it("ignora PATH vacío/relativo y ejecutables del repo, incluso por symlinks", async () => {
    const root = await directory()
    const external = await directory()
    const safe = await directory()
    const bin = path.join(root, "bin")
    await mkdir(bin)
    const dangerous = await executable(bin, "codex", 'throw new Error("Nunca ejecutar este wrapper")')
    await symlink(bin, path.join(external, "linked-directory"))
    await symlink(dangerous, path.join(external, "codex"))
    const trusted = await executable(safe, "codex")
    const paths = ["", "bin", ".", bin, path.join(external, "linked-directory"), external, safe].join(path.delimiter)
    const resolved = await resolveClientExecutable("codex", root, paths)
    expect(resolved?.path).toBe(await realpath(trusted))
    expect(resolved?.safePath.split(path.delimiter)).not.toContain(await realpath(bin))
    expect(await resolveClientExecutable("codex", root, ["", "bin", bin, external].join(path.delimiter))).toBeNull()
    const runner = vi.fn<ProbeRunner>()
    const result = await diagnoseClient("codex", root, { pathValue: bin, runner })
    expect(result[0]?.status).toBe("no disponible")
    expect(runner).not.toHaveBeenCalled()
  })

  it("ejecuta solo --version, limita recursos y nunca usa TMPDIR dentro del proyecto", async () => {
    const root = await directory()
    const bin = await directory()
    const temp = path.join(root, "temporary")
    await mkdir(temp)
    await executable(bin, "codex")
    vi.stubEnv("TMPDIR", temp)
    vi.stubEnv("TEMP", temp)
    vi.stubEnv("TMP", temp)
    const runner = vi.fn<ProbeRunner>(async (_file, args, options) => {
      expect(args).toEqual(["--version"])
      expect(options.timeout).toBe(3_000)
      expect(options.maxBuffer).toBe(64 * 1024)
      expect(options.cwd.startsWith(await realpath(root))).toBe(false)
      expect(options.env.PATH).toBe(await realpath(bin))
      return { stdout: "codex-cli 0.138.0\n" }
    })
    const result = await diagnoseClient("codex", root, { pathValue: bin, runner })
    expect(result.find((item) => item.id === "client.compatibility")?.status).toBe("correcto")
    expect(runner).toHaveBeenCalledOnce()
    const resolved = await resolveClientExecutable("codex", root, bin)
    await expect(probeOptions(resolved!, path.parse(await realpath(root)).root)).rejects.toThrow("No hay directorio temporal seguro")
  })

  it.each([
    ["codex", "codex-cli 0.137.0", "incompatible"],
    ["codex", "codex-cli 0.138.0-beta.1", "incompatible"],
    ["codex", "codex-cli 0.139.0", "correcto"],
    ["claude", "2.1.1 (Claude Code)", "no comprobado"],
    ["opencode", "1.2.3", "no comprobado"],
  ] as const)("separa versión observada y compatibilidad de %s %s", async (target, version, expected) => {
    const root = await directory()
    const result = await diagnoseClient(target, root, {
      resolver: async () => ({ path: "/external/client", safePath: "/usr/bin" }),
      runner: async () => ({ stdout: `${version}\ntexto arbitrario que nunca debe publicarse` }),
    })
    expect(result.find((item) => item.id === "client.version")?.status).toBe("correcto")
    expect(result.find((item) => item.id === "client.compatibility")?.status).toBe(expected)
    expect(JSON.stringify(result)).not.toContain("texto arbitrario")
  })

  it("no publica salida o errores crudos ni da PASS ante timeout o versión ilegible", async () => {
    const root = await directory()
    const resolver = async () => ({ path: "/external/client", safePath: "/usr/bin" })
    for (const runner of [
      async () => { throw Object.assign(new Error("dato confidencial"), { killed: true }) },
      async () => { throw new Error("dato confidencial") },
      async () => ({ stdout: "dato confidencial" }),
    ]) {
      const results = await diagnoseClient("codex", root, { resolver, runner })
      expect(results.find((item) => item.id === "client.version")?.status).toBe("no comprobado")
      expect(results.some((item) => item.id === "client.compatibility" && item.status === "correcto")).toBe(false)
      expect(JSON.stringify(results)).not.toContain("dato confidencial")
    }
  })

  it("inspecciona contexto ausente, vigente, desactualizado e inválido sin modificarlo", async () => {
    const root = await directory()
    expect(projectContextDiagnostic(await inspectRuntimeProject(root)).status).toBe("no disponible")
    await writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node test.mjs" } }))
    await initializeProjectContext(root)
    const file = path.join(root, ".agents/project.yaml")
    const before = await readFile(file, "utf8")
    const current = await inspectRuntimeProject(root)
    expect(projectContextDiagnostic(current).status).toBe("correcto")
    const commands = commandCapabilities(["opencode", "claude", "codex"], current, context(root))
    expect(commands.some((item) => item.id.startsWith("project.commands.static.") && item.evidence.includes("npm run test"))).toBe(true)
    for (const target of ["opencode", "claude", "codex"]) {
      for (const role of ["ms-codex", "ms-fastlane", "ms-tester"]) {
        const preflight = commands.find((item) => item.target === target && item.id.endsWith(`.${role}`))
        expect(preflight?.status).toBe("no comprobado")
        expect(preflight?.operation).toMatchObject({ command: "npm run test", target, role, decision: "unknown", effects: { status: "unknown", writes: null }, runtime: "unknown" })
      }
    }
    expect(commands.filter((item) => item.id.endsWith(".runtime")).every((item) => item.status === "no comprobado")).toBe(true)
    await writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node changed.mjs" } }))
    expect(projectContextDiagnostic(await inspectRuntimeProject(root)).status).toBe("incompatible")
    expect(await readFile(file, "utf8")).toBe(before)
    await writeFile(file, "schemaVersion: [")
    expect((await inspectRuntimeProject(root)).status).toBe("invalid")
    expect(await readFile(file, "utf8")).toBe("schemaVersion: [")
  })

  it("no atribuye reglas del kit a comandos de OpenCode", async () => {
    const root = await directory()
    expect(staticCommandDecision("npm run test", "ms-tester", context(root))).toBe("unknown")
    expect(staticCommandDecision("cat .env", "ms-codex", context(root))).toBe("unknown")
    expect(staticCommandDecision("npm test && cat .env", "ms-codex", context(root))).toBe("unknown")
    expect(staticCommandDecision("some-unknown-command", "ms-codex", context(root))).toBe("unknown")
  })

  it("doctor usa el snapshot personal para mostrar grants exactos sin ejecutar el comando", async () => {
    const root = await realpath(await directory())
    const buildContext = context(root)
    await writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node test.mjs" } }))
    const initialized = await initializeProjectContext(root)
    initialized.project.context.commands.test = [{ command: "./scripts/verify.sh", cwd: ".", source: "package.json" }]
    await writeFile(initialized.path, JSON.stringify(initialized.project))
    await mkdir(path.join(buildContext.homeDir, ".ms-agent-kit"), { recursive: true })
    await writeFile(path.join(buildContext.homeDir, ".ms-agent-kit/config.yaml"), JSON.stringify({ schemaVersion: 1, models: {}, verification: { projects: [{ root, commands: ["./scripts/verify.sh"], outputPaths: ["coverage"] }] } }))
    // El script no existe: el diagnóstico nunca lo ejecuta ni atribuye disponibilidad real.
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "doctor", "--target", "opencode", "--scope", "project", "--project", root, "--home", buildContext.homeDir, "--json"], { encoding: "utf8", env: { ...process.env, PATH: "" }, timeout: 300_000 })
    expect(result.error).toBeUndefined()
    expect([0, 1]).toContain(result.status)
    const payload = JSON.parse(result.stdout)
    const preflight = payload.capabilities.find((item: { id: string }) => item.id.startsWith("project.commands.static.test.") && item.id.endsWith(".ms-tester"))
    expect(preflight).toMatchObject({ status: "no comprobado", operation: { command: "./scripts/verify.sh", decision: "unknown", runtime: "unknown", effects: { status: "unknown", writes: null }, projectAuthorization: { command: true, outputPaths: ["coverage"], source: path.join(buildContext.homeDir, ".ms-agent-kit/config.yaml#verification.projects") } } })
  })

  it("exige artefacto instalado para Context7 y no infiere reconocimiento ni acceso remoto", async () => {
    const root = await directory()
    const destination = path.join(root, "config.toml")
    const plan: InstallPlan = { statePath: "state", stateDir: "state", obsolete: [], items: [{ artifact: { target: "codex", name: "context7", kind: "configuration", destination, root, content: Buffer.from("config"), mode: 0o644 }, action: "create", reason: "test", desiredHash: "hash" }] }
    const targets: Target[] = ["codex", "claude"]
    expect(installationCapabilities(targets, plan, []).find((item) => item.id === "context7.installation" && item.target === "codex")?.status).toBe("no disponible")
    plan.items[0]!.action = "unchanged"
    const diagnostics = installationCapabilities(targets, plan, [{ target: "codex", path: destination, status: "ok" }])
    expect(diagnostics.find((item) => item.id === "context7.installation" && item.target === "codex")?.status).toBe("correcto")
    expect(diagnostics.find((item) => item.id === "context7.installation" && item.target === "claude")?.status).toBe("no disponible")
    expect(diagnostics.filter((item) => ["runtime.agents-skills", "context7.runtime", "models.availability"].includes(item.id)).every((item) => item.status === "no comprobado")).toBe(true)
    plan.items[0]!.artifact.mcpServers = [{ name: "playwright", content: "config" }]
    const partial = installationCapabilities(targets, plan, [{ target: "codex", path: destination, status: "ok" }])
    expect(partial.find((item) => item.id === "context7.installation" && item.target === "codex")?.status).toBe("no disponible")
    expect(partial.find((item) => item.id === "playwright.installation" && item.target === "codex")?.status).toBe("correcto")
    expect(partial.find((item) => item.id === "playwright.runtime" && item.target === "codex")?.status).toBe("no comprobado")
    plan.items[0]!.satisfiedExternally = true
    expect(installationCapabilities(targets, plan, [{ target: "codex", path: destination, status: "ok" }]).find((item) => item.id === "context7.installation" && item.target === "codex")?.status).toBe("no disponible")
    expect(installationCapabilities(targets, null, []).find((item) => item.id === "installation.integrity")?.status).toBe("no comprobado")
  })

  it("doctor devuelve capabilities y rechaza wrappers del proyecto incluso con contexto inválido", async () => {
    const root = await directory()
    const bin = path.join(root, "bin")
    await mkdir(bin)
    const marker = path.join(root, "executed")
    await executable(bin, "codex", `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ejecutado")`)
    await mkdir(path.join(root, ".agents"))
    const projectFile = path.join(root, ".agents/project.yaml")
    await writeFile(projectFile, "schemaVersion: [")
    const args = ["--import", "tsx", path.join(process.cwd(), "src/cli.ts"), "doctor", "--target", "codex", "--scope", "project", "--project", root, "--home", path.join(root, "home"), "--json"]
    const result = spawnSync(process.execPath, args, { encoding: "utf8", env: { ...process.env, PATH: bin }, timeout: 15_000 })
    expect(result.status).toBe(1)
    expect(result.stderr).toBe("")
    const payload = JSON.parse(result.stdout)
    expect(payload.ok).toBe(false)
    expect(payload.capabilities).toContainEqual(expect.objectContaining({ id: "client.binary", status: "no disponible" }))
    expect(payload.capabilities).toContainEqual(expect.objectContaining({ id: "project.context", status: "incompatible" }))
    await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await readFile(projectFile, "utf8")).toBe("schemaVersion: [")
  })
})
