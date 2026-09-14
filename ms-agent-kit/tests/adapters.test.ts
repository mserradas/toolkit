import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, it } from "vitest"
import { buildArtifacts } from "../src/adapters/index.js"
import { AGENT_DEFINITIONS, agentDefinition } from "../src/core/agent-catalog.js"
import { DEFAULT_ASSETS_ROOT, loadCatalog } from "../src/core/catalog.js"
import { parseMarkdown } from "../src/core/frontmatter.js"
import { openCodeRolePermission } from "../src/core/opencode-role-permissions.js"
import { capabilityProfile, gitInspectionCommands } from "../src/core/profiles.js"
import {
  OPENCODE_SECRET_BASH_RULES,
  OPENCODE_SECRET_READ_RULES,
} from "../src/core/permissions.js"
import { owningTargets, type BuildContext } from "../src/core/types.js"

const temporaryDirectories: string[] = []
const execFileAsync = promisify(execFile)

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function context(scope: BuildContext["scope"] = "project"): Promise<BuildContext> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-adapters-"))
  temporaryDirectories.push(projectRoot)
  return {
    assetsRoot: DEFAULT_ASSETS_ROOT,
    homeDir: path.join(projectRoot, "home"),
    projectRoot,
    scope,
  }
}

describe("platform adapters", () => {
  it("keeps agent assets prompt-only and covers them with central definitions", async () => {
    const catalog = await loadCatalog(DEFAULT_ASSETS_ROOT)

    for (const agent of catalog.agents) {
      expect(Object.keys(agent.frontmatter)).toEqual(["description"])
      const definition = agentDefinition(agent.name)
      expect(definition).toBeDefined()
      if (definition.mode === "subagent") {
        expect(capabilityProfile(definition.capabilityProfile).asksQuestions).toBe(false)
      }
    }
    expect(Object.keys(AGENT_DEFINITIONS).sort()).toEqual(
      catalog.agents.map((agent) => agent.name).sort(),
    )
  })

  it("builds the full catalog without destination collisions", async () => {
    const buildContext = await context()
    const artifacts = await buildArtifacts(["opencode", "claude", "codex"], buildContext)
    const counts = Object.fromEntries(
      ["opencode", "claude", "codex"].map((target) => [
        target,
        artifacts.filter((artifact) => owningTargets(artifact).includes(target)).length,
      ]),
    )

    const catalog = await loadCatalog(DEFAULT_ASSETS_ROOT)
    const skillFiles = catalog.skills.reduce((count, skill) => count + skill.files.length, 0)
    expect(counts).toEqual({
      opencode: catalog.agents.length + catalog.commands.length + skillFiles + catalog.documentation.length + catalog.openCodeConfigFiles.length + catalog.openCodePlugins.length + 1,
      claude: catalog.agents.length + catalog.commands.length + skillFiles + 2,
      codex: catalog.agents.length - 1 + catalog.commands.length + catalog.skills.filter((skill) => skill.name !== "skill-creator").reduce((count, skill) => count + skill.files.length, 0) + 3,
    })
    expect(artifacts).toHaveLength(Object.values(counts).reduce((sum, count) => sum + count, 0))
    expect(new Set(artifacts.map((artifact) => artifact.destination)).size).toBe(artifacts.length)
    expect(
      artifacts.every((artifact) =>
        !/(?:^|[\\/])ms-agent-kit(?:[\\/]|$)/m.test(
          artifact.content.toString("utf8").replaceAll(buildContext.projectRoot, "<project>"),
        ),
      ),
    ).toBe(true)
    const openCodeSkill = artifacts.find(
      (artifact) =>
        artifact.target === "opencode" &&
        artifact.kind === "skill" &&
        artifact.name === "cognitive-doc-design",
    )
    const codexSkill = artifacts.find(
      (artifact) =>
        artifact.target === "codex" &&
        artifact.kind === "skill" &&
        artifact.name === "cognitive-doc-design",
    )
    expect(openCodeSkill?.destination).not.toBe(codexSkill?.destination)
    const generatedLanguageSources = [
      artifacts.find(
        (artifact) =>
          artifact.target === "opencode" &&
          artifact.kind === "agent" &&
          artifact.name === "ms-spec",
      ),
      artifacts.find(
        (artifact) =>
          artifact.target === "claude" &&
          artifact.kind === "skill" &&
          artifact.name === "ms-shared",
      ),
      artifacts.find(
        (artifact) =>
          artifact.target === "codex" &&
          artifact.kind === "agent" &&
          artifact.name === "ms-spec",
      ),
    ]
    for (const source of generatedLanguageSources) {
      expect(source).toBeDefined()
      const content = source!.content.toString("utf8")
      expect(content).toContain("Toda prosa humana de documentación")
      expect(content).toContain("Conserva sin traducir identificadores")
      expect(content).toContain("conserva el idioma del documento existente")
      expect(content).not.toContain("normaliza al español toda la prosa humana")
    }
    expect(
      artifacts.some((artifact) => ["ms-progress", "ms-continue"].includes(artifact.name)),
    ).toBe(false)
    const statusCommands = artifacts.filter(
      (artifact) => artifact.kind === "command" && artifact.name === "ms-status",
    )
    expect(statusCommands).toHaveLength(3)
    for (const status of statusCommands) {
      const content = status.content.toString("utf8")
      expect(content).not.toMatch(/ms-progress|ms-continue|\.atl\/status|checkpoint/i)
      expect(content).toContain("contexto actual")
      expect(content).toContain("artefactos durables")
    }

    const doctors = artifacts.filter(
      (artifact) => artifact.kind === "command" && artifact.name === "ms-doctor",
    )
    expect(doctors).toHaveLength(3)
    expect(doctors.find((artifact) => artifact.target === "opencode")?.content.toString("utf8"))
      .toContain("MS Doctor · OpenCode")
    expect(doctors.find((artifact) => artifact.target === "claude")?.content.toString("utf8"))
      .toContain("MS Doctor · Claude Code")
    expect(doctors.find((artifact) => artifact.target === "codex")?.content.toString("utf8"))
      .toContain("MS Doctor · Codex")
    expect(doctors.find((artifact) => artifact.target === "codex")?.content.toString("utf8"))
      .toContain("No inspecciones OpenCode ni Claude Code")
    expect(doctors.find((artifact) => artifact.target === "codex")?.content.toString("utf8"))
      .not.toContain("# Reglas Compartidas MS")
    const codexDoctor = doctors.find((artifact) => artifact.target === "codex")?.content.toString("utf8") ?? ""
    expect(codexDoctor).toContain("Aplica primero el perfil padre")
    expect(codexDoctor).toContain('`extends = ":read-only"` es compatible')
    expect(codexDoctor).toContain("`~/.ms-agent-kit/state.json`")
    expect(codexDoctor).toContain("Limitaciones del entorno")
    expect(codexDoctor).toContain("skill principal `ms-architect`")
  })

  it("keeps OpenCode models and embeds the shared contract", async () => {
    const buildContext = await context()
    const artifacts = await buildArtifacts(["opencode"], buildContext)
    const agents = artifacts.filter((artifact) => artifact.kind === "agent")
    const skills = artifacts.filter((artifact) => artifact.kind === "skill")
    const architect = artifacts.find(
      (artifact) => artifact.kind === "agent" && artifact.name === "ms-architect",
    )

    expect(agents).toHaveLength(12)
    const catalog = await loadCatalog(DEFAULT_ASSETS_ROOT)
    expect(skills).toHaveLength(catalog.skills.reduce((count, skill) => count + skill.files.length, 0))
    expect(new Set(skills.map((artifact) => artifact.name))).toHaveLength(catalog.skills.length)
    for (const agent of agents) {
      const definition = agentDefinition(agent.name)
      const model = definition.models.opencode
      const document = parseMarkdown(agent.content.toString("utf8"))
      const expectedFrontmatter = [
        "color",
        "description",
        "mode",
        "model",
        "permission",
        "variant",
      ]
      if (definition.mode === "subagent") expectedFrontmatter.push("steps")
      expect(Object.keys(document.frontmatter).sort()).toEqual(expectedFrontmatter.sort())
      const permission = document.frontmatter.permission as Record<string, unknown>
      expect(permission.doom_loop).toBe("deny")
      expect(document.frontmatter.color).toBe(definition.openCodeColor)
      expect(document.frontmatter.color).toMatch(/^#[0-9A-F]{6}$/)
      expect(document.frontmatter.model).toBe(model.model)
      expect(document.frontmatter.variant).toBe(model.reasoningEffort)
      if (definition.mode === "subagent") {
        expect(document.frontmatter.steps).toBe(agent.name === "ms-codex" ? 32 : definition.toolCycleBudget)
      }
      const rolePermission = openCodeRolePermission(agent.name)
      expect(permission.skill).toEqual(rolePermission.skill)
      expect(permission.lsp).toBe(rolePermission.lsp)
      expect(permission.question).toBe(definition.mode === "primary" ? "allow" : "deny")
      expect(permission.todowrite).toBe(rolePermission.todowrite)
      const bash = permission.bash as Record<string, unknown>
      const read = permission.read as Record<string, unknown>
      expect(Object.keys(bash).slice(-Object.keys(OPENCODE_SECRET_BASH_RULES).length)).toEqual(
        Object.keys(OPENCODE_SECRET_BASH_RULES),
      )
      expect(read).toEqual(OPENCODE_SECRET_READ_RULES)
      expect(bash).toMatchObject({ env: "deny", "env *": "deny", "printenv*": "deny" })
      expect(document.body.match(/# Reglas Compartidas MS/g)).toHaveLength(1)
    }
    expect(new Set(agents.map((agent) => agentDefinition(agent.name).openCodeColor))).toHaveLength(12)
    expect(architect).toBeDefined()
    const parsed = parseMarkdown(architect!.content.toString("utf8"))
    expect(parsed.frontmatter.model).toBe("openai/gpt-5.6-sol")
    expect(parsed.frontmatter.variant).toBe("high")
    expect(parsed.frontmatter.permission).toMatchObject({
      edit: "deny",
      question: "allow",
      task: {
        "*": "deny",
        "ms-codex": "allow",
        "ms-tester": "allow",
      },
      bash: {
        "*": "deny",
        "git diff*": "allow",
      },
    })
    expect(parsed.body).toContain("# Reglas Compartidas MS")
    expect(parsed.body).toContain("Contrato para ms-architect")
    expect(parsed.body).toContain("ms-project-init")
    const fastlane = artifacts.find(
      (artifact) => artifact.kind === "agent" && artifact.name === "ms-fastlane",
    )
    expect(parseMarkdown(fastlane!.content.toString("utf8")).frontmatter).toMatchObject({
      model: "openai/gpt-5.6-luna",
      variant: "low",
      steps: 12,
      permission: { todowrite: "deny" },
    })
    const writer = artifacts.find(
      (artifact) => artifact.kind === "agent" && artifact.name === "ms-writer",
    )
    expect(parseMarkdown(writer!.content.toString("utf8")).frontmatter).toMatchObject({
      model: "openai/gpt-5.6-sol",
      variant: "medium",
      steps: 20,
      permission: { todowrite: "deny" },
    })
    const skill = artifacts.find(
      (artifact) => artifact.kind === "skill" && artifact.name === "cognitive-doc-design",
    )
    const skillCreator = artifacts.find(
      (artifact) => artifact.kind === "skill" && artifact.name === "skill-creator",
    )
    expect(skill?.destination).toBe(
      path.join(buildContext.projectRoot, ".opencode", "skills", "cognitive-doc-design", "SKILL.md"),
    )
    expect(skill?.destination).not.toContain(path.join(".agents", "skills"))
    expect(skillCreator?.destination).toBe(
      path.join(buildContext.projectRoot, ".opencode", "skills", "skill-creator", "SKILL.md"),
    )
    expect(parseMarkdown(skillCreator!.content.toString("utf8")).frontmatter.name).toBe(
      "skill-creator",
    )
    expect(
      artifacts.find(
        (artifact) => artifact.kind === "skill" && artifact.name === "ms-skill-creator",
      ),
    ).toBeUndefined()
    expect(
      artifacts.find(
        (artifact) => artifact.kind === "skill" && artifact.name === "ms-project-init",
      ),
    ).toBeDefined()
    expect(
      artifacts.find(
        (artifact) => artifact.kind === "plugin" && artifact.name === "ms-workflow-tools.ts",
      ),
    ).toBeUndefined()
  })

  it("offers balanced, strict, and trusted OpenCode permission profiles", () => {
    const balanced = openCodeRolePermission("ms-codex", "balanced")
    expect(balanced).toMatchObject({ lsp: "deny", todowrite: "deny", skill: { "*": "allow", "ms-architect": "deny" }, question: "deny" })
    expect(balanced.bash).toMatchObject({ "*": "ask", "rm -rf*": "deny", "npm install*": "ask" })

    const strict = openCodeRolePermission("ms-codex", "strict")
    expect(strict).toMatchObject({ lsp: "deny", todowrite: "deny", skill: { "*": "allow", "ms-architect": "deny" } })
    expect(strict.bash).toMatchObject({ "*": "ask", "rm -rf*": "deny" })

    const trusted = openCodeRolePermission("ms-codex", "trusted")
    expect(trusted).toMatchObject({ lsp: "deny", todowrite: "deny", skill: { "*": "allow", "ms-architect": "deny" }, websearch: "allow" })
    expect(trusted.bash).toMatchObject({ "*": "allow", "rm -rf*": "deny", "npm install*": "allow" })
    expect(trusted.task).toEqual({ "*": "deny" })

    for (const profile of ["balanced", "strict", "trusted"] as const) {
      expect(openCodeRolePermission("ms-architect", profile).todowrite).toBe("allow")
      expect(openCodeRolePermission("ms-fastlane", profile).todowrite).toBe("deny")
      for (const [name, definition] of Object.entries(AGENT_DEFINITIONS)) {
        const rolePermission = openCodeRolePermission(name, profile)
        expect(rolePermission.question).toBe(definition.mode === "primary" ? "allow" : "deny")
        if (profile === "balanced") {
          const strictPermission = openCodeRolePermission(name, "strict")
          expect(rolePermission.skill).toEqual(strictPermission.skill)
          expect(rolePermission.lsp).toBe(strictPermission.lsp)
        }
      }
    }

    for (const role of ["ms-fastlane", "ms-tester"] as const) {
      expect(openCodeRolePermission(role, "balanced").bash).toMatchObject({ "*": "deny" })
    }
    expect(openCodeRolePermission("ms-tester", "balanced").bash).toMatchObject({
      "npm run validate*": "allow",
      "pnpm run verify*": "allow",
      "yarn run ci*": "allow",
      "bun run quality*": "allow",
      "make verify*": "allow",
      "npm run *:fix*": "deny",
      "*--update-snapshot*": "deny",
    })
    expect(openCodeRolePermission("ms-debugger", "balanced").bash).toMatchObject({
      "*": "deny",
      "docker logs*": "ask",
      "kubectl logs*": "ask",
    })
    expect(balanced.bash).toMatchObject({
      "git push*": "deny",
      "ssh *": "deny",
      "brew install*": "deny",
    })
  })

  it("keeps doctor read-only allows exact in every emitted architect profile", async () => {
    const commands = [
      "ms-agent-kit doctor --target opencode --scope user --json",
      "ms-agent-kit doctor --target opencode --scope project --json",
    ]
    for (const profile of ["balanced", "strict", "trusted"] as const) {
      const buildContext = await context()
      buildContext.permissionProfile = profile
      const artifacts = await buildArtifacts(["opencode"], buildContext)
      const architect = artifacts.find((artifact) => artifact.kind === "agent" && artifact.name === "ms-architect")!
      const permission = parseMarkdown(architect.content.toString("utf8")).frontmatter.permission as Record<string, unknown>
      const bash = permission.bash as Record<string, string>
      const doctorRules = Object.entries(bash).filter(([command]) => command.startsWith("ms-agent-kit doctor"))
      expect(doctorRules).toEqual(commands.map((command) => [command, "allow"]))
      expect(doctorRules.every(([command]) => !command.includes("*"))).toBe(true)
      const decision = (command: string) => Object.entries(bash).reduce((last, [pattern, action]) => {
        const expression = pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")
        return new RegExp(`^${expression}$`).test(command) ? action : last
      }, "deny")
      for (const command of commands) expect(decision(command)).toBe("allow")
      for (const command of [
        `${commands[0]} --extra`,
        "ms-agent-kit doctor --target codex --scope user --json",
        "ms-agent-kit doctor --target opencode --scope user",
        "ms-agent-kit install --target opencode --scope user --json",
        "ms-agent-kit uninstall --target opencode --scope user --json",
      ]) expect(decision(command)).toBe("deny")
      expect(Object.keys(bash).slice(-Object.keys(OPENCODE_SECRET_BASH_RULES).length)).toEqual(Object.keys(OPENCODE_SECRET_BASH_RULES))
    }
  })

  it("keeps OpenCode shell permissions narrow and read-only where required", () => {
    const bashPermission = (name: string) =>
      openCodeRolePermission(name, "balanced").bash as Record<string, string>

    for (const name of Object.keys(AGENT_DEFINITIONS)) {
      const bash = bashPermission(name)
      if (typeof bash === "object") {
        expect(bash["find *"]).toBeUndefined()
        expect(bash["git branch*"]).toBeUndefined()
      }
    }

    for (const name of [
      "ms-architect",
      "ms-codex",
      "ms-debugger",
      "ms-scout",
      "ms-security-auditor",
    ]) {
      const bash = bashPermission(name)
      const allowedBranchCommands = Object.entries(bash)
        .filter(([command, action]) => command.startsWith("git branch") && action === "allow")
        .map(([command]) => command)
      expect(allowedBranchCommands).toEqual([
        "git branch",
        "git branch --show-current",
        "git branch --list",
        "git branch -a",
        "git branch -r",
      ])
      expect(bash["git branch --list*"]).toBeUndefined()
    }

    for (const name of [
      "ms-codex",
      "ms-debugger",
      "ms-scout",
      "ms-security-auditor",
      "ms-tester",
    ]) {
      expect(bashPermission(name)).toMatchObject({
        "tree *": "allow",
        "rg *": "allow",
        "grep *": "allow",
      })
    }

    for (const name of ["ms-designer", "ms-spec"]) {
      expect(bashPermission(name)).toEqual({
        "*": "deny",
        ...Object.fromEntries(gitInspectionCommands(capabilityProfile(agentDefinition(name).capabilityProfile)).map((command) => [command, "allow"])),
        "pwd": "allow",
        "ls -d .": "allow",
        "command -v ms-agent-kit": "allow",
      })
    }

    const coder = bashPermission("ms-codex")
    expect(coder).toMatchObject({
      "pnpm build": "allow",
      "pnpm run build": "allow",
      "pnpm build:staging": "allow",
      "pnpm run build:staging": "allow",
      "pnpm exec ng test*": "allow",
      "pnpm exec ng build --configuration development": "allow",
      "pnpm exec prettier *--check*": "allow",
      "pnpm exec prettier *-*w*": "ask",
      "uv run alembic heads*": "allow",
      "uv run alembic history*": "allow",
      "*--write*": "ask",
      "uv run alembic upgrade*": "ask",
      "uv run alembic downgrade*": "ask",
      "uv run alembic revision*": "ask",
      "uv run alembic stamp*": "ask",
      "rm -rf*": "deny",
      "git push*": "deny",
      "bash -c *": "deny",
      "sh -c *": "deny",
      "*&&*": "deny",
      "*&*": "deny",
      "*;*": "deny",
      "*|*": "deny",
      "*$(*": "deny",
      "*`*": "deny",
      "*<(*": "deny",
      "*>(*": "deny",
      "*>*": "deny",
      "*<*": "deny",
      "*\n*": "deny",
    })
    expect(coder["pnpm build*"]).toBeUndefined()
    expect(coder["pnpm run build*"]).toBeUndefined()
    expect(coder["pnpm exec ng build*"]).toBeUndefined()
    const coderCommands = Object.keys(coder)
    expect(coderCommands.indexOf("*--write*")).toBeGreaterThan(
      coderCommands.indexOf("pnpm exec prettier *--check*"),
    )
    const lastCoderPrettierAllow = Math.max(
      ...Object.entries(coder)
        .filter(
          ([command, action]) =>
            command.startsWith("pnpm exec prettier") && action === "allow",
        )
        .map(([command]) => coderCommands.indexOf(command)),
    )
    expect(coderCommands.indexOf("pnpm exec prettier *-*w*")).toBeGreaterThan(
      lastCoderPrettierAllow,
    )
    const lastCoderAlembicReadCommand = Math.max(
      coderCommands.indexOf("uv run alembic heads*"),
      coderCommands.indexOf("uv run alembic history*"),
    )
    for (const mutatingAlembicCommand of [
      "uv run alembic upgrade*",
      "uv run alembic downgrade*",
      "uv run alembic revision*",
      "uv run alembic stamp*",
    ]) {
      expect(coderCommands.indexOf(mutatingAlembicCommand)).toBeGreaterThan(
        lastCoderAlembicReadCommand,
      )
    }
    const lastCoderAllowOrAsk = Math.max(
      ...Object.entries(coder)
        .filter(([, action]) => action === "allow" || action === "ask")
        .map(([command]) => coderCommands.indexOf(command)),
    )
    const terminalCompositionRules = [
      "bash -c *",
      "sh -c *",
      "*&&*",
      "*&*",
      "*;*",
      "*|*",
      "*$(*",
      "*`*",
      "*<(*",
      "*>(*",
      "*>*",
      "*<*",
      "*\n*",
      "*\r*",
    ]
    for (const blockedComposition of terminalCompositionRules) {
      expect(coderCommands.indexOf(blockedComposition)).toBeGreaterThan(lastCoderAllowOrAsk)
    }
    expect(coderCommands.slice(-terminalCompositionRules.length)).toEqual(
      terminalCompositionRules,
    )
    const adversarialCommands = new Map([
      ["uv run alembic heads & echo unsafe", "*&*"],
      ["$(echo unsafe)", "*$(*"],
      ["`echo unsafe`", "*`*"],
      ["diff <(first) <(second)", "*<(*"],
      ["tee >(consumer)", "*>(*"],
      ["cat payload > ~/.zshrc", "*>*"],
      ["cat < ~/.ssh/id_rsa", "*<*"],
      ["uv run alembic heads\necho unsafe", "*\n*"],
    ])
    for (const [adversarialCommand, denyRule] of adversarialCommands) {
      expect(coder[denyRule], `regla terminal para: ${adversarialCommand}`).toBe("deny")
    }

    const tester = bashPermission("ms-tester")
    expect(tester).toMatchObject({
      "pnpm build*": "allow",
      "pnpm exec ng test*": "allow",
      "pnpm exec prettier *--check*": "allow",
      "uv run alembic heads*": "allow",
      "uv run alembic history*": "allow",
      "*--fix*": "deny",
      "*--write*": "deny",
      "pnpm install*": "deny",
      "uv run alembic upgrade*": "deny",
      "uv run alembic downgrade*": "deny",
      "uv run alembic revision*": "deny",
      "uv run alembic stamp*": "deny",
    })
    const testerCommands = Object.keys(tester)
    expect(testerCommands.indexOf("*--write*")).toBeGreaterThan(
      testerCommands.indexOf("pnpm exec prettier *--check*"),
    )
    const lastAlembicReadCommand = Math.max(
      testerCommands.indexOf("uv run alembic heads*"),
      testerCommands.indexOf("uv run alembic history*"),
    )
    for (const mutatingAlembicCommand of [
      "uv run alembic upgrade*",
      "uv run alembic downgrade*",
      "uv run alembic revision*",
      "uv run alembic stamp*",
    ]) {
      expect(testerCommands.indexOf(mutatingAlembicCommand)).toBeGreaterThan(
        lastAlembicReadCommand,
      )
    }

    const debuggerPermission = bashPermission("ms-debugger")
    expect(debuggerPermission).toMatchObject({
      "*": "deny",
      lsof: "allow",
      "lsof *": "allow",
      "pgrep *": "allow",
      "docker logs*": "ask",
      "docker inspect*": "ask",
      "kubectl get*": "ask",
    })
    for (const blockedDiagnostic of [
      "redis-cli *",
      "celery *",
      "gh *",
      "docker exec*",
      "python *",
    ]) {
      expect(debuggerPermission[blockedDiagnostic]).toBeUndefined()
    }
  })

  it("restricts operational document writers to .agents/docs", () => {
    const roles = [
      ["ms-plan", "prd-writer", "prd"],
      ["ms-discovery", "discovery-writer", "discovery"],
      ["ms-spec", "spec-writer", "spec"],
      ["ms-designer", "design-writer", "design"],
    ] as const

    for (const [role, profile, directory] of roles) {
      const expectedPaths = [
        `.agents/docs/${directory}/*.md`,
        `.agents/docs/${directory}/**/*.md`,
      ]
      expect(capabilityProfile(profile).writePaths).toEqual(expectedPaths)
      expect(openCodeRolePermission(role, "balanced").edit).toEqual({
        "*": "deny",
        [expectedPaths[0]]: "allow",
        [expectedPaths[1]]: "allow",
      })
    }
  })

  it("builds a reproducible global OpenCode configuration without secrets", async () => {
    const buildContext = await context("user")
    const artifacts = await buildArtifacts(["opencode"], buildContext)
    const configurations = artifacts.filter((artifact) => artifact.kind === "configuration")
    const opencode = configurations.find((artifact) => artifact.name === "opencode.json")
    const tui = configurations.find((artifact) => artifact.name === "tui.json")

    const catalog = await loadCatalog(DEFAULT_ASSETS_ROOT)
    expect(artifacts).toHaveLength(catalog.agents.length + catalog.commands.length + catalog.skills.reduce((count, skill) => count + skill.files.length, 0) + catalog.documentation.length + catalog.openCodeConfigFiles.length + catalog.openCodePlugins.length + 1)
    expect(configurations).toHaveLength(2)
    expect(opencode?.destination).toBe(path.join(buildContext.homeDir, ".config", "opencode", "opencode.json"))
    const openCodeConfig = JSON.parse(opencode!.content.toString("utf8"))
    expect(openCodeConfig).toMatchObject({
      model: "openai/gpt-5.6-sol",
      default_agent: "ms-architect",
      mcp: {
        playwright: { type: "local", command: ["npx", "-y", "@playwright/mcp@latest"], enabled: true },
        context7: {
          headers: { CONTEXT7_API_KEY: "{env:CONTEXT7_API_KEY}" },
        },
      },
      permission: {
        read: { "**/.env": "deny" },
        bash: {
          env: "deny",
          "* .env": "deny",
          "* **/*.pem": "deny",
        },
        skill: "allow",
      },
    })
    expect(openCodeConfig).not.toHaveProperty("instructions")
    expect(openCodeConfig).not.toHaveProperty("plugin")
    expect(
      artifacts.some((artifact) => artifact.name === "opencode-notifier.json"),
    ).toBe(false)
    expect(
      configurations.some((artifact) =>
        artifact.content.toString("utf8").includes("@mohak34/opencode-notifier"),
      ),
    ).toBe(false)
    expect(
      artifacts.find(
        (artifact) =>
          artifact.kind === "documentation" && artifact.name === "agents-shared.md",
      ),
    ).toBeDefined()
    expect(JSON.parse(tui!.content.toString("utf8"))).toMatchObject({
      attention: { enabled: true, notifications: false, sound: false },
    })
    expect(tui!.content.toString("utf8")).not.toContain("opencode-subagent-statusline")
    expect(opencode!.content.toString("utf8")).not.toMatch(/sk-[A-Za-z0-9]/)
  })

  it("renders Claude agents with role-specific models, budgets, and restrictions", async () => {
    const artifacts = await buildArtifacts(["claude"], await context())
    const agents = artifacts.filter((artifact) => artifact.kind === "agent")
    const architect = artifacts.find((artifact) => artifact.name === "ms-architect" && artifact.kind === "agent")
    const scout = artifacts.find((artifact) => artifact.name === "ms-scout" && artifact.kind === "agent")
    const fastlane = artifacts.find((artifact) => artifact.name === "ms-fastlane" && artifact.kind === "agent")
    const writer = artifacts.find((artifact) => artifact.name === "ms-writer" && artifact.kind === "agent")
    const commands = artifacts.filter((artifact) => artifact.kind === "command")

    const architectDocument = parseMarkdown(architect!.content.toString("utf8"))
    const scoutDocument = parseMarkdown(scout!.content.toString("utf8"))
    const taskTools = [
      "TaskCreate",
      "TaskGet",
      "TaskList",
      "TaskStop",
      "TaskUpdate",
      "TodoWrite",
    ]
    for (const agent of agents) {
      const definition = agentDefinition(agent.name)
      const model = definition.models.claude
      const capability = capabilityProfile(definition.capabilityProfile)
      const frontmatter = parseMarkdown(agent.content.toString("utf8")).frontmatter
      expect(frontmatter.model).toBe(model.model ?? "inherit")
      expect(frontmatter.maxTurns).toBe(definition.toolCycleBudget)
      expect(frontmatter.effort).toBe(model.reasoningEffort ?? undefined)
      const expectedTools = ["Read", "Grep", "Glob"]
      if (capability.shell) expectedTools.push("Bash")
      if (capability.writes) expectedTools.push("Write", "Edit", "NotebookEdit")
      if (capability.usesSkills) expectedTools.push("Skill")
      if (definition.mode === "primary" && capability.asksQuestions) {
        expectedTools.push("AskUserQuestion")
      }
      if (capability.orchestrates) {
        expectedTools.push("Agent", "SendMessage", ...taskTools)
      }
      if (capability.webFetch) expectedTools.push("WebFetch")
      if (capability.webSearch) expectedTools.push("WebSearch")
      expect(frontmatter.tools).toEqual(expectedTools)
      expect(frontmatter.tools).not.toEqual(
        expect.arrayContaining([
          "ToolSearch",
          "Artifact",
          "TaskOutput",
          "Workflow",
          "Worktree",
          "mcp__context7__resolve-library-id",
        ]),
      )
      const disallowedTools = (frontmatter.disallowedTools ?? []) as string[]
      for (const tool of expectedTools) expect(disallowedTools).not.toContain(tool)
      if (definition.mode === "subagent") expect(disallowedTools).toContain("AskUserQuestion")
      else expect(disallowedTools).not.toContain("AskUserQuestion")
      for (const tool of taskTools) {
        if (!capability.orchestrates) expect(disallowedTools).toContain(tool)
        else expect(disallowedTools).not.toContain(tool)
      }
    }
    for (const name of ["ms-plan", "ms-discovery"]) {
      const frontmatter = parseMarkdown(
        agents.find((agent) => agent.name === name)!.content.toString("utf8"),
      ).frontmatter
      const disallowedTools = (frontmatter.disallowedTools ?? []) as string[]
      expect(disallowedTools).not.toContain("AskUserQuestion")
      expect(disallowedTools).toEqual(expect.arrayContaining(taskTools))
    }
    expect(architectDocument.frontmatter).toMatchObject({
      name: "ms-architect",
      model: "inherit",
      permissionMode: "default",
      skills: ["ms-shared"],
    })
    expect(architectDocument.frontmatter.disallowedTools).toEqual(
      expect.arrayContaining(["Write", "Edit", "NotebookEdit"]),
    )
    const architectDeniedTools = architectDocument.frontmatter.disallowedTools as string[]
    expect(architectDeniedTools).not.toContain("Agent")
    expect(architectDeniedTools).not.toContain("AskUserQuestion")
    for (const tool of taskTools) expect(architectDeniedTools).not.toContain(tool)
    expect(scoutDocument.frontmatter.disallowedTools).toEqual(
      expect.arrayContaining(["Write", "Edit", "Agent", "SendMessage", "Skill", "WebSearch"]),
    )
    expect(scoutDocument.frontmatter.maxTurns).toBe(12)
    expect(scoutDocument.frontmatter.hooks).toBeDefined()
    expect(JSON.stringify(architectDocument.frontmatter.hooks)).toContain("SendMessage")
    expect(architectDocument.frontmatter.hooks).not.toHaveProperty("Stop")
    expect(scoutDocument.frontmatter.hooks).toHaveProperty("Stop")
    expect(parseMarkdown(fastlane!.content.toString("utf8")).frontmatter).toMatchObject({
      model: "haiku",
      effort: "low",
      maxTurns: 12,
    })
    expect(parseMarkdown(writer!.content.toString("utf8")).frontmatter).toMatchObject({
      model: "inherit",
      maxTurns: 20,
    })
    expect(parseMarkdown(writer!.content.toString("utf8")).frontmatter).not.toHaveProperty("effort")

    const designer = artifacts.find(
      (artifact) => artifact.name === "ms-designer" && artifact.kind === "agent",
    )
    const designerDocument = parseMarkdown(designer!.content.toString("utf8"))
    expect(designerDocument.frontmatter.disallowedTools).toEqual(expect.arrayContaining(["Agent"]))
    expect(designerDocument.frontmatter.disallowedTools).not.toContain("Bash")
    expect(JSON.stringify(designerDocument.frontmatter.hooks)).toContain("ms-agent-guard.mjs")

    const expectedWorkflowAgents = new Map([
      ["ms-doctor", "ms-architect"],
      ["ms-status", "ms-architect"],
      ["ms-fastlane", "ms-fastlane"],
      ["ms-handoff", "ms-architect"],
    ])
    expect(commands).toHaveLength(expectedWorkflowAgents.size)
    for (const command of commands) {
      expect(parseMarkdown(command.content.toString("utf8")).frontmatter).toMatchObject({
        context: "fork",
        agent: expectedWorkflowAgents.get(command.name),
      })
    }

  })

  it("materializes a validated ternary Bash policy for every Claude agent", async () => {
    const artifacts = await buildArtifacts(["claude"], await context())
    const guard = artifacts.find(
      (artifact) => artifact.kind === "policy" && artifact.name === "ms-agent-guard",
    )
    const source = guard?.content.toString("utf8") ?? ""
    const match = /const BASH_POLICIES = (\{[\s\S]*?\})\nconst MATERIALIZED_AGENTS/.exec(source)
    expect(match).not.toBeNull()
    const policies = JSON.parse(match![1]) as Record<
      string,
      { fallback: string; allow: string[]; ask: string[]; deny: string[] }
    >
    const catalog = await loadCatalog(DEFAULT_ASSETS_ROOT)

    expect(Object.keys(policies).sort()).toEqual(catalog.agents.map((agent) => agent.name).sort())
    expect(policies["ms-codex"].fallback).toBe("ask")
    for (const agent of catalog.agents) {
      const policy = policies[agent.name]
      expect(["allow", "ask", "deny"]).toContain(policy.fallback)
      expect(policy).toEqual(expect.objectContaining({
        allow: expect.any(Array),
        ask: expect.any(Array),
        deny: expect.any(Array),
      }))
      if (openCodeRolePermission(agent.name).bash === "deny") {
        expect(policy).toEqual({ fallback: "deny", allow: [], ask: [], deny: [] })
      }
    }
    expect(
      Object.values(policies).flatMap((policy) => policy.allow),
    ).not.toEqual(expect.arrayContaining([expect.stringMatching(/^opencode\s/)]))
    expect(
      Object.values(policies).flatMap((policy) => policy.allow),
    ).not.toEqual(expect.arrayContaining([expect.stringMatching(/^git\s+config(?:\s|$)/)]))
    expect(source).not.toContain("BASH_ALLOW_RULES")
    expect(source).not.toContain("if (!rules) return true")
  })

  it("renders Codex TOML agents and parent orchestration skills", async () => {
    const buildContext = await context()
    const artifacts = await buildArtifacts(["codex"], buildContext)
    const agents = artifacts.filter((artifact) => artifact.kind === "agent")
    const architectAgent = agents.find((artifact) => artifact.name === "ms-architect")
    const scout = artifacts.find((artifact) => artifact.name === "ms-scout" && artifact.kind === "agent")
    const coder = artifacts.find((artifact) => artifact.name === "ms-codex" && artifact.kind === "agent")
    const fastlane = artifacts.find((artifact) => artifact.name === "ms-fastlane" && artifact.kind === "agent")
    const architectSkill = artifacts.find(
      (artifact) =>
        artifact.name === "ms-architect" &&
        artifact.kind === "skill" &&
        artifact.destination.endsWith("SKILL.md"),
    )
    const context7 = artifacts.find(
      (artifact) => artifact.name === "context7" && artifact.kind === "configuration",
    )
    const secretRules = artifacts.find(
      (artifact) => artifact.name === "ms-secrets" && artifact.kind === "policy",
    )

    expect(agents).toHaveLength(11)
    expect(architectAgent).toBeUndefined()
    expect(scout!.content.toString("utf8")).toContain('default_permissions = "ms-agent"')
    expect(scout!.content.toString("utf8")).toContain('extends = ":read-only"')
    expect(scout!.content.toString("utf8")).toContain('"**/.env" = "deny"')
    expect(scout!.content.toString("utf8")).toContain('model_reasoning_effort = "low"')
    expect(scout!.content.toString("utf8")).not.toContain("\nmodel = ")
    expect(coder!.content.toString("utf8")).toContain('extends = ":workspace"')
    expect(coder!.content.toString("utf8")).toContain('model_reasoning_effort = "high"')
    expect(fastlane!.content.toString("utf8")).toContain('model_reasoning_effort = "low"')
    expect(fastlane!.content.toString("utf8")).not.toContain("\nmodel = ")

    const representativeBudgets = {
      "ms-fastlane": 12,
      "ms-scout": 12,
      "ms-tester": 16,
      "ms-codex": 20,
    } as const
    for (const [name, budget] of Object.entries(representativeBudgets)) {
      expect(agentDefinition(name).toolCycleBudget).toBe(budget)
    }

    const noWorkerPlan = "No crees ni actualices planes o TODOs del cliente"
    const noCoordination = "No delegues ni coordines otros agentes"
    const noShell = "No uses Bash ni shell"
    const noSkills = "No cargues ni invoques skills"
    for (const agent of agents) {
      const definition = agentDefinition(agent.name)
      const capability = capabilityProfile(definition.capabilityProfile)
      const content = agent.content.toString("utf8")
      if (definition.toolCycleBudget === undefined) {
        expect(content).not.toContain("Presupuesto operativo objetivo:")
      } else {
        expect(content).toContain(
          `Presupuesto operativo objetivo: ${definition.toolCycleBudget} ciclos de herramienta.`,
        )
        expect(content).toContain(
          `Al agotar el ciclo ${definition.toolCycleBudget} sin completar`,
        )
        expect(content).toContain("status: partial")
      }
      if (definition.mode !== "primary" || !capability.asksQuestions) {
        expect(content).toContain("No preguntes directamente al usuario")
      } else {
        expect(content).not.toContain("No preguntes directamente al usuario")
      }
      if (!capability.orchestrates) {
        expect(content).toContain(noWorkerPlan)
        expect(content).toContain(noCoordination)
      } else {
        expect(content).not.toContain(noWorkerPlan)
        expect(content).not.toContain(noCoordination)
      }
      if (capability.shell) expect(content).not.toContain(noShell)
      else expect(content).toContain(noShell)
      if (capability.usesSkills) expect(content).not.toContain(noSkills)
      else expect(content).toContain(noSkills)
    }

    for (const name of ["ms-codex", "ms-fastlane", "ms-tester", "ms-scout"]) {
      const content = agents.find((agent) => agent.name === name)!.content.toString("utf8")
      expect(content).toContain(noWorkerPlan)
      expect(content).toContain(noCoordination)
      if (name === "ms-scout") expect(content).toContain(noSkills)
      else expect(content).toContain("Puedes cargar skills técnicas seleccionadas")
    }
    for (const name of ["ms-plan", "ms-discovery"]) {
      const content = agents.find((agent) => agent.name === name)!.content.toString("utf8")
      expect(content).not.toContain("No preguntes directamente al usuario")
      expect(content).toContain(noWorkerPlan)
      expect(content).toContain(noCoordination)
    }

    const designer = artifacts.find(
      (artifact) => artifact.name === "ms-designer" && artifact.kind === "agent",
    )
    expect(designer!.content.toString("utf8")).toContain('".agents/docs/design/**" = "write"')
    expect(architectSkill!.destination).toContain(path.join(".agents", "skills", "ms-architect", "SKILL.md"))
    expect(parseMarkdown(architectSkill!.content.toString("utf8")).body).toContain(
      "Contrato para ms-architect",
    )
    expect(parseMarkdown(architectSkill!.content.toString("utf8")).body).toContain(
      "Cada `spawn_agent` es una delegación normal",
    )
    expect(architectSkill!.content.toString("utf8")).not.toContain(
      "Presupuesto operativo objetivo:",
    )
    expect(architectSkill!.content.toString("utf8")).not.toContain(
      "No preguntes directamente al usuario",
    )
    for (const workerProhibition of [noWorkerPlan, noCoordination, noShell, noSkills]) {
      expect(architectSkill!.content.toString("utf8")).not.toContain(workerProhibition)
    }
    expect(context7).toMatchObject({
      destination: path.join(buildContext.projectRoot, ".codex", "config.toml"),
      root: path.join(buildContext.projectRoot, ".codex"),
      strategy: "managed-block",
      blockId: "codex-context7",
      satisfaction: "codex-mcp",
      mode: 0o644,
    })
    expect(context7?.content.toString("utf8")).toBe(
      '[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"\n' +
        'env_http_headers = { "CONTEXT7_API_KEY" = "CONTEXT7_API_KEY" }\n\n' +
        '[mcp_servers.playwright]\ncommand = "npx"\nargs = ["-y", "@playwright/mcp@latest"]\n',
    )
    expect(context7?.content.toString("utf8").match(/CONTEXT7_API_KEY/g)).toHaveLength(2)
    expect(context7?.content.toString("utf8")).not.toMatch(/authorization|bearer|sk-[A-Za-z0-9]/i)
    expect(artifacts.some((artifact) => artifact.destination.endsWith("openai.yaml"))).toBe(false)
    expect(
      artifacts.find(
        (artifact) => artifact.name === "ms-skill-creator" && artifact.kind === "skill",
      ),
    ).toBeUndefined()
    expect(secretRules!.destination).toContain(path.join(".codex", "rules", "ms-secrets.rules"))
    expect(secretRules!.content.toString("utf8")).toContain('decision = "forbidden"')
    expect(secretRules!.content.toString("utf8")).toContain('match = ["cat .env"')
    expect(secretRules!.content.toString("utf8")).toContain('not_match = ["cat .env.example"')

    const status = artifacts.find(
      (artifact) => artifact.name === "ms-status" && artifact.kind === "command",
    )
    expect(status!.content.toString("utf8")).toContain("$ms-status")
    expect(status!.content.toString("utf8")).not.toContain("# Reglas Compartidas MS")
  })

  it("does not expose the removed session workflow CLI", async () => {
    const cli = path.join(process.cwd(), "src", "cli.ts")
    const { stdout } = await execFileAsync(process.execPath, ["--import", "tsx", cli, "--help"])

    expect(stdout).not.toContain("workflow status")
    expect(stdout).not.toContain("workflow next")
    await expect(
      execFileAsync(process.execPath, ["--import", "tsx", cli, "workflow", "status"]),
    ).rejects.toMatchObject({ code: 2 })
  })

  it("installs user-scoped Codex skills under CODEX_HOME", async () => {
    const buildContext = await context("user")
    const artifacts = await buildArtifacts(["codex"], buildContext)
    const skills = artifacts.filter(
      (artifact) => artifact.kind === "skill" || artifact.kind === "command",
    )

    expect(skills.length).toBeGreaterThan(0)
    for (const skill of skills) {
      expect(skill.destination).toContain(path.join(buildContext.homeDir, ".codex", "skills"))
      expect(skill.destination).not.toContain(path.join(buildContext.homeDir, ".agents", "skills"))
    }
    const context7 = artifacts.find(
      (artifact) => artifact.name === "context7" && artifact.kind === "configuration",
    )
    expect(context7).toMatchObject({
      destination: path.join(buildContext.homeDir, ".codex", "config.toml"),
      root: path.join(buildContext.homeDir, ".codex"),
      strategy: "managed-block",
      blockId: "codex-context7",
      satisfaction: "codex-mcp",
    })
    expect(artifacts.some((artifact) => artifact.destination.endsWith("openai.yaml"))).toBe(false)
  })
})
