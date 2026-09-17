import { mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { commandPreflight, staticCommandDecision } from "../src/core/command-preflight.js"
import type { BuildContext, Target } from "../src/core/types.js"

const context: BuildContext = { projectRoot: "/repo", homeDir: "/home", assetsRoot: "/assets", scope: "project" }
const operation = (command: string, cwd = ".") => ({ command, cwd, source: "package.json" })
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

describe("pure command preflight", () => {
  it("reconoce las consultas documentales exactas sin inferir runtime ni ampliar cwd", () => {
    for (const role of ["ms-designer", "ms-spec"] as const) {
      for (const target of ["opencode", "claude", "codex"] as const) {
        for (const probe of ["pwd", "ls -d ."]) {
          expect(commandPreflight(operation(probe), target, role, context)).toMatchObject({ decision: "unknown", effects: { status: "known", writes: [] }, runtime: "unknown" })
          for (const cwd of ["nested", "../external"]) expect(commandPreflight(operation(probe, cwd), target, role, context).decision).toBe("unknown")
        }
        for (const command of ["pwd -P", "ls", "ls -d /repo", "ls -d ..", "ls .env", "ls -d . extra", "command -v node", "command -v ms-agent-kit extra", "command ms-agent-kit", "ls -d . && command -v ms-agent-kit", "pwd; pwd", "ls -d $(pwd)", "pwd > out", "sh -c pwd", "bash -c pwd", "env pwd", "ms-agent-kit project inspect", "npm test", "npm run build"]) {
          expect(commandPreflight(operation(command), target, role, context).decision, `${role}: ${command}`).toBe("unknown")
        }
      }
    }
  })

  it("preserves the static API while separating permissions from uninspected script effects", () => {
    expect(staticCommandDecision("npm run test", "ms-tester", context)).toBe("unknown")
    expect(staticCommandDecision("npm test && cat .env", "ms-codex", context)).toBe("unknown")
    const result = commandPreflight(operation("npm run test"), "opencode", "ms-tester", context)
    expect(result).toMatchObject({ decision: "unknown", policy: { decision: "unknown" }, effects: { status: "unknown", writes: null }, services: { status: "unknown", required: null }, runtime: "unknown" })
    expect(result.reasons.join(" ")).toContain("directorios de resultados")
  })

  it("uses native unprobed permissions for OpenCode without borrowing other client policies", () => {
    expect(commandPreflight(operation("pwd"), "opencode", "ms-codex", context).decision).toBe("unknown")
    expect(commandPreflight(operation("other-command"), "opencode", "ms-codex", context).decision).toBe("unknown")
    for (const target of ["codex", "claude"] as const) {
      expect(commandPreflight(operation("pwd"), target, "ms-codex", context)).toMatchObject({ decision: "unknown", policy: { decision: "unknown" }, effects: { writes: [] }, runtime: "unknown" })
    }
    for (const target of ["opencode", "claude", "codex"] as Target[]) {
      for (const command of ["cat .env", "cat ../secrets/token", "npm test && cat .env"]) {
        expect(commandPreflight(operation(command), target, "ms-codex", context).decision, `${target}: ${command}`).toBe("unknown")
      }
      for (const command of ["make test", "docker compose run test", "./verify.sh"]) {
        const result = commandPreflight(operation(command), target, "ms-tester", context)
        expect(result.decision).toBe("unknown")
        expect(result.effects.writes).toBeNull()
        expect(result.services.required).toBeNull()
      }
      expect(commandPreflight(operation('echo "ordinary text"'), target, "ms-codex", context).policy.decision).toBe("unknown")
      expect(commandPreflight(operation("bash -c 'cat .env'"), target, "ms-codex", context).decision).toBe("unknown")
    }
  })

  it("separa consultas conocidas de scripts y no usa efectos desconocidos como denegación", () => {
    for (const command of ["pwd", "git status", "git status --short", "git status --porcelain", "git --version", "node --version", "git --no-pager diff --no-ext-diff --no-textconv --stat -- .agents/docs/design"]) {
      expect(commandPreflight(operation(command), "opencode", "ms-codex", context)).toMatchObject({ effects: { status: "known", writes: [] }, runtime: "unknown", services: { status: "unknown" } })
    }
    for (const command of ["git diff -- src", "git status --unknown", "pnpm --version", "make test"]) expect(commandPreflight(operation(command), "opencode", "ms-codex", context).effects.status).toBe("unknown")
    for (const [role, command] of [["ms-fastlane", "pnpm build"], ["ms-fastlane", "rg TODO src"], ["ms-tester", "node node_modules/vitest/vitest.mjs run"]] as const) {
      expect(commandPreflight(operation(command), "opencode", role, context)).toMatchObject({ decision: "unknown", policy: { decision: "unknown" }, effects: { status: "unknown", writes: null }, runtime: "unknown" })
    }
    expect(commandPreflight(operation("docker compose run test"), "opencode", "ms-tester", context).decision).toBe("unknown")
  })

  it("retains provenance and never grants workspace paths from cwd metadata", () => {
    expect(commandPreflight(operation("pwd", "../external"), "opencode", "ms-tester", context)).toMatchObject({ command: "pwd", cwd: "../external", source: "package.json", decision: "unknown" })
    const command = "git --no-pager diff --no-ext-diff --no-textconv --stat -- .agents/docs/design"
    expect(commandPreflight(operation(command, "nested"), "opencode", "ms-designer", context).decision).toBe("unknown")
    for (const target of ["opencode", "claude", "codex"] as const) {
      expect(commandPreflight(operation("git diff -- src"), target, "ms-designer", context).decision).toBe("unknown")
    }
  })

  it("muestra concesiones personales exactas y salidas autorizadas sin inferir efectos", async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "ms-preflight-grants-")))
    roots.push(root)
    const commands = ["./scripts/verify.sh", "docker compose -f compose.test.yml run --rm tests"]
    const granted: BuildContext = { ...context, projectRoot: root, kitConfiguration: { schemaVersion: 1, models: {}, verification: { projects: [{ root, commands, outputPaths: ["coverage", "test-results"] }] } } }
    for (const role of ["ms-codex", "ms-fastlane", "ms-tester"] as const) {
      for (const command of commands) {
        expect(staticCommandDecision(command, role, granted)).toBe("unknown")
        expect(commandPreflight(operation(command), "opencode", role, granted)).toMatchObject({ decision: "unknown", policy: { decision: "unknown", source: "opencode: sin política de permisos del kit; configuración nativa no comprobada" }, effects: { status: "unknown", writes: null }, runtime: "unknown", projectAuthorization: { command: true, outputPaths: ["coverage", "test-results"] } })
      }
    }
    for (const target of ["claude", "codex"] as const) expect(commandPreflight(operation(commands[0]!), target, "ms-tester", granted)).toMatchObject({ decision: "unknown", projectAuthorization: { command: true }, effects: { status: "unknown" } })
    for (const candidate of [commandPreflight(operation(commands[0]!, "nested"), "opencode", "ms-tester", granted), commandPreflight(operation(commands[0]!), "opencode", "ms-tester", { ...granted, scope: "user" }), commandPreflight(operation(commands[0]!), "opencode", "ms-tester", { ...granted, projectRoot: path.join(root, "other") }), commandPreflight(operation(commands[0]!), "opencode", "ms-designer", granted)]) {
      expect(candidate.decision).toBe("unknown")
      expect(candidate.projectAuthorization).toEqual({ command: false, outputPaths: [], source: null })
    }
    expect(commandPreflight(operation(`${commands[0]} extra`), "opencode", "ms-tester", granted).decision).toBe("unknown")
    expect(commandPreflight(operation(`${commands[0]} && cat .env`), "opencode", "ms-tester", granted).decision).toBe("unknown")
  })
})
