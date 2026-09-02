import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import YAML from "yaml"
import { afterEach, describe, expect, it, vi } from "vitest"
import { initializeProjectContext, inspectProjectContext, readProjectFile } from "../src/core/project-context.js"
import { acquireOperationLock } from "../src/core/operation-lock.js"
import * as files from "../src/core/files.js"

const roots: string[] = []
const run = promisify(execFile)
const cli = path.resolve("src/cli.ts")
const tsx = path.resolve("node_modules/tsx/dist/loader.mjs")

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ms-project-context-"))
  roots.push(root)
  return root
}

async function put(root: string, relative: string, content: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true })
  await writeFile(path.join(root, relative), content)
}

async function nodeProject(root: string): Promise<void> {
  await put(root, "package.json", JSON.stringify({ packageManager: "pnpm@11.0.0", scripts: { test: "node -e 'throw new Error()'", typecheck: "tsc --noEmit", build: "tsc" } }))
}

describe("contexto persistente de proyecto", () => {
  it("descubre Node y monorepos preservando cwd, sin ejecutar los scripts", async () => {
    const root = await fixture()
    await nodeProject(root)
    await put(root, "apps/web/package.json", JSON.stringify({ scripts: { lint: "eslint" } }))
    await put(root, "apps/web/yarn.lock", "# lock")
    const result = await initializeProjectContext(root)
    expect(result.action).toBe("created")
    expect(result.project.context.packageManager).toBe("pnpm")
    expect(result.project.context.modules).toEqual([{ path: ".", stack: ["node"] }, { path: "apps/web", stack: ["node"] }])
    expect(result.project.context.commands.test).toEqual([{ command: "pnpm run test", cwd: ".", source: "package.json" }])
    expect(result.project.context.commands.lint).toEqual([{ command: "yarn run lint", cwd: "apps/web", source: "apps/web/package.json" }])
    expect((await inspectProjectContext(root)).status).toBe("current")
  })

  it("descubre Python con uv o Poetry a partir de configuración declarativa", async () => {
    const root = await fixture()
    await put(root, "pyproject.toml", '[project]\nname = "demo"\n[tool.pytest.ini_options]\n[tool.ruff]\n')
    await put(root, "uv.lock", "version = 1")
    await put(root, "services/api/pyproject.toml", '[tool.poetry]\nname = "api"\n[tool.mypy]\n')
    const { project } = await initializeProjectContext(root)
    expect(project.context.stack).toEqual(["python"])
    expect(project.context.packageManager).toBe("uv")
    expect(project.context.commands.test[0]?.command).toBe("uv run pytest")
    expect(project.context.commands.typecheck).toEqual([{ command: "poetry run mypy .", cwd: "services/api", source: "services/api/pyproject.toml" }])
  })

  it("reconoce check de TypeScript y prioriza scripts de comprobación de formato", async () => {
    const root = await fixture()
    await put(root, "package.json", JSON.stringify({ scripts: { check: "tsc -p tsconfig.json --noEmit", format: "prettier --write .", "format:check": "prettier --check ." } }))
    const { project } = await initializeProjectContext(root)
    expect(project.context.commands.typecheck[0]?.command).toBe("npm run check")
    expect(project.context.commands.format[0]?.command).toBe("npm run format:check")
    await put(root, "package.json", JSON.stringify({ scripts: { check: "echo check", "type-check": "tsc --noEmit" } }))
    expect((await initializeProjectContext(root)).project.context.commands.typecheck[0]?.command).toBe("npm run type-check")
    await put(root, "package.json", JSON.stringify({ scripts: { check: "echo check" } }))
    expect((await initializeProjectContext(root)).project.context.commands.typecheck).toEqual([])
  })

  it("preserva bytes y mtime cuando no hay cambios", async () => {
    const root = await fixture()
    await nodeProject(root)
    const first = await initializeProjectContext(root)
    const content = await readFile(first.path)
    const before = await stat(first.path)
    expect((await initializeProjectContext(root)).action).toBe("unchanged")
    expect(await readFile(first.path)).toEqual(content)
    expect((await stat(first.path)).mtimeMs).toBe(before.mtimeMs)
  })

  it("refresca fuentes añadidas, modificadas y eliminadas conservando preferencias y comentarios", async () => {
    const root = await fixture()
    await nodeProject(root)
    await put(root, "pnpm-lock.yaml", "lockfileVersion: 9")
    const first = await initializeProjectContext(root)
    const document = YAML.parseDocument(await readFile(first.path, "utf8"))
    document.commentBefore = " Preferencias del equipo"
    document.setIn(["preferences", "documentation", "language"], "es-MX")
    document.setIn(["preferences", "documentation", "paths"], ["documentation/guides"])
    document.setIn(["preferences", "technicalSkills"], ["react-testing"])
    await writeFile(first.path, document.toString())
    await put(root, "package.json", JSON.stringify({ scripts: { test: "vitest" } }))
    await rm(path.join(root, "pnpm-lock.yaml"))
    await put(root, "packages/new/package.json", "{}")
    const beforeInspect = await readFile(first.path)
    expect(await inspectProjectContext(root)).toMatchObject({ status: "stale", changedSources: ["package.json", "packages/new/package.json", "pnpm-lock.yaml"] })
    expect(await readFile(first.path)).toEqual(beforeInspect)
    const updated = await initializeProjectContext(root)
    expect(updated.action).toBe("updated")
    expect(updated.project.preferences).toEqual({ documentation: { language: "es-MX", paths: ["documentation/guides"] }, technicalSkills: ["react-testing"] })
    expect(await readFile(first.path, "utf8")).toContain("Preferencias del equipo")
    expect((await inspectProjectContext(root)).status).toBe("current")
  })

  it("inspect y dry-run no crean configuración ni locks", async () => {
    const root = await fixture()
    expect(await inspectProjectContext(root)).toEqual({ status: "missing", changedSources: [], project: null })
    expect((await initializeProjectContext(root, { dryRun: true })).action).toBe("created")
    expect(await readProjectFile(root)).toBeNull()
    await expect(stat(path.join(root, ".agents"))).rejects.toMatchObject({ code: "ENOENT" })
    await expect(stat(path.join(root, ".ms-agent-kit"))).rejects.toMatchObject({ code: "ENOENT" })
  })

  it.each(["../outside", "/tmp/docs", "docs/../../outside", "docs/**", ".", ".git", ".codex", ".claude", "settings", "secrets", ".env", "docs/readme.md", "C:\\outside"])("rechaza directorios documentales inseguros: %s", async (unsafe) => {
    const root = await fixture()
    const result = await initializeProjectContext(root)
    result.project.preferences.documentation.paths = [unsafe]
    const content = YAML.stringify(result.project)
    await writeFile(result.path, content)
    await expect(initializeProjectContext(root)).rejects.toMatchObject({ code: "STATE_INVALID" })
    expect(await readFile(result.path, "utf8")).toBe(content)
  })

  it.each(["schema", "unknown", "aliases", "syntax", "size"])("rechaza estado corrupto o incompatible: %s", async (kind) => {
    const root = await fixture()
    const result = await initializeProjectContext(root)
    const document = YAML.parseDocument(await readFile(result.path, "utf8"))
    if (kind === "schema") document.set("schemaVersion", 2)
    if (kind === "unknown") document.setIn(["preferences", "unknown"], true)
    const content = kind === "aliases" ? "a: &alias [a]\nb: *alias\n" : kind === "syntax" ? "[bad" : kind === "size" ? "#".repeat(256 * 1024 + 1) : document.toString()
    await writeFile(result.path, content)
    await expect(readProjectFile(root)).rejects.toMatchObject({ code: "STATE_INVALID" })
    await expect(initializeProjectContext(root)).rejects.toMatchObject({ code: "STATE_INVALID" })
    expect(await readFile(result.path, "utf8")).toBe(content)
  })

  it.each(["manifest", "parent", "state", "lock", "root"])("rechaza symlinks al leer o escribir: %s", async (kind) => {
    const root = await fixture()
    const outside = await fixture()
    await nodeProject(outside)
    if (kind === "manifest") await symlink(path.join(outside, "package.json"), path.join(root, "package.json"))
    if (kind === "parent") await symlink(outside, path.join(root, ".agents"))
    if (kind === "lock") await symlink(outside, path.join(root, ".ms-agent-kit"))
    if (kind === "state") {
      await mkdir(path.join(root, ".agents"))
      await symlink(path.join(outside, "package.json"), path.join(root, ".agents/project.yaml"))
    }
    if (kind === "root") await symlink(outside, path.join(root, "linked"))
    await expect(initializeProjectContext(kind === "root" ? path.join(root, "linked") : root)).rejects.toMatchObject({ code: "STATE_INVALID" })
    await expect(stat(path.join(outside, "project.yaml"))).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("respeta el lock existente y una señal de cancelación sin escribir", async () => {
    const root = await fixture()
    const lock = await acquireOperationLock({ projectRoot: root, homeDir: root, assetsRoot: root, scope: "project" }, "install")
    try { await expect(initializeProjectContext(root)).rejects.toMatchObject({ code: "OPERATION_LOCKED" }) }
    finally { await lock.release() }
    const controller = new AbortController()
    controller.abort(new Error("cancelado"))
    await expect(initializeProjectContext(root, { signal: controller.signal })).rejects.toThrow("cancelado")
    expect(await readProjectFile(root)).toBeNull()
  })

  it.each([false, true])("preserva un archivo cambiado concurrentemente antes de publicar (existía: %s)", async (existing) => {
    const root = await fixture()
    if (existing) await initializeProjectContext(root)
    await nodeProject(root)
    const atomicWriteFile = files.atomicWriteFile
    vi.spyOn(files, "atomicWriteFile").mockImplementation(async (...args) => {
      await atomicWriteFile(...args)
      await put(root, ".agents/project.yaml", "# Edición concurrente\n")
    })
    await expect(initializeProjectContext(root)).rejects.toMatchObject({ code: "INSTALL_CONFLICT" })
    expect(await readFile(path.join(root, ".agents/project.yaml"), "utf8")).toBe("# Edición concurrente\n")
  })

  it("cancela antes de publicar y limpia el temporal y el lock", async () => {
    const root = await fixture()
    const controller = new AbortController()
    const atomicWriteFile = files.atomicWriteFile
    vi.spyOn(files, "atomicWriteFile").mockImplementation(async (...args) => {
      await atomicWriteFile(...args)
      controller.abort(new Error("cancelado antes de publicar"))
    })
    await expect(initializeProjectContext(root, { signal: controller.signal })).rejects.toThrow("cancelado antes de publicar")
    expect(await readProjectFile(root)).toBeNull()
    await expect(stat(path.join(root, ".ms-agent-kit/operation.lock"))).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("CLI usa cwd, persiste entre procesos y entrega errores JSON estables", async () => {
    const root = await fixture()
    await nodeProject(root)
    const invoke = (args: string[]) => run(process.execPath, ["--import", tsx, cli, "project", ...args, "--json"], { cwd: root, timeout: 300_000 })
    expect(JSON.parse((await invoke(["init", "--dry-run"])).stdout).action).toBe("created")
    expect(await readProjectFile(root)).toBeNull()
    expect(JSON.parse((await invoke(["init"])).stdout).action).toBe("created")
    expect(JSON.parse((await invoke(["inspect", "--project", root])).stdout).status).toBe("current")
    try { await invoke(["inspect", "--dry-run"]); throw new Error("Se esperaba error") }
    catch (error) {
      const failure = error as { code: number; stderr: string }
      expect(failure.code).toBe(2)
      expect(JSON.parse(failure.stderr).code).toBe("INVALID_ARGUMENT")
    }
  })
})
