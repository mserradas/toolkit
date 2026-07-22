import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildArtifacts } from "../src/adapters/index.js"
import { AGENT_DEFINITIONS, agentDefinition } from "../src/core/agent-catalog.js"
import { DEFAULT_ASSETS_ROOT, loadCatalog } from "../src/core/catalog.js"
import { parseMarkdown } from "../src/core/frontmatter.js"
import { openCodeRolePermission } from "../src/core/opencode-role-permissions.js"
import {
  OPENCODE_SECRET_BASH_RULES,
  OPENCODE_SECRET_READ_RULES,
} from "../src/core/permissions.js"
import { owningTargets, type BuildContext } from "../src/core/types.js"

const temporaryDirectories: string[] = []

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
      expect(agentDefinition(agent.name)).toBeDefined()
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

    expect(counts).toEqual({ opencode: 27, claude: 25, codex: 24 })
    expect(artifacts).toHaveLength(76)
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

    expect(agents).toHaveLength(13)
    expect(skills).toHaveLength(7)
    expect(new Set(skills.map((artifact) => artifact.name))).toHaveLength(7)
    for (const agent of agents) {
      const document = parseMarkdown(agent.content.toString("utf8"))
      const expectedFrontmatter = [
        "color",
        "description",
        "mode",
        "model",
        "permission",
        "variant",
      ]
      if (agentDefinition(agent.name).mode === "subagent") expectedFrontmatter.push("steps")
      expect(Object.keys(document.frontmatter).sort()).toEqual(expectedFrontmatter.sort())
      const permission = document.frontmatter.permission as Record<string, unknown>
      expect(permission.doom_loop).toBe("deny")
      expect(document.frontmatter.color).toBe(agentDefinition(agent.name).openCodeColor)
      expect(document.frontmatter.color).toMatch(/^#[0-9A-F]{6}$/)
      if (agentDefinition(agent.name).mode === "subagent") {
        expect(document.frontmatter.steps).toBe(20)
      }
      expect(permission.skill).toBe("allow")
      expect(permission.lsp).toBe("allow")
      expect(permission.todowrite).toBe("allow")
      const bash = permission.bash as Record<string, unknown>
      const read = permission.read as Record<string, unknown>
      expect(Object.keys(bash).slice(-Object.keys(OPENCODE_SECRET_BASH_RULES).length)).toEqual(
        Object.keys(OPENCODE_SECRET_BASH_RULES),
      )
      expect(read).toEqual(OPENCODE_SECRET_READ_RULES)
      expect(bash).toMatchObject({ env: "deny", "env *": "deny", "printenv*": "deny" })
      expect(document.body.match(/# Reglas Compartidas MS/g)).toHaveLength(1)
    }
    expect(new Set(agents.map((agent) => agentDefinition(agent.name).openCodeColor))).toHaveLength(13)
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
    expect(parsed.body).toContain("checkpoint simple")
    const progress = artifacts.find(
      (artifact) => artifact.kind === "agent" && artifact.name === "ms-progress",
    )
    const progressPermission = parseMarkdown(progress!.content.toString("utf8")).frontmatter.permission
    expect(progressPermission).toMatchObject({
      edit: {
        "*": "deny",
        ".atl/status/*.md": "allow",
        ".gitignore": "allow",
      },
      bash: {
        "*": "deny",
        "mkdir -p .atl/status": "allow",
        "rm .atl/status/*-progress.md": "allow",
      },
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
    expect(balanced).toMatchObject({ lsp: "allow", todowrite: "allow", skill: "allow" })
    expect(balanced.bash).toMatchObject({ "*": "ask", "rm -rf*": "deny", "npm install*": "ask" })

    const strict = openCodeRolePermission("ms-codex", "strict")
    expect(strict).toMatchObject({ lsp: "deny", todowrite: "deny", skill: "deny" })
    expect(strict.bash).toMatchObject({ "*": "ask", "rm -rf*": "deny" })

    const trusted = openCodeRolePermission("ms-codex", "trusted")
    expect(trusted).toMatchObject({ lsp: "allow", todowrite: "allow", skill: "allow", websearch: "allow" })
    expect(trusted.bash).toMatchObject({ "*": "allow", "rm -rf*": "deny", "npm install*": "allow" })
    expect(trusted.task).toEqual({ "*": "deny" })

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

  it("builds a reproducible global OpenCode configuration without secrets", async () => {
    const buildContext = await context("user")
    const artifacts = await buildArtifacts(["opencode"], buildContext)
    const configurations = artifacts.filter((artifact) => artifact.kind === "configuration")
    const opencode = configurations.find((artifact) => artifact.name === "opencode.json")
    const tui = configurations.find((artifact) => artifact.name === "tui.json")
    const notifier = configurations.find((artifact) => artifact.name === "opencode-notifier.json")

    expect(artifacts).toHaveLength(28)
    expect(configurations).toHaveLength(3)
    expect(opencode?.destination).toBe(path.join(buildContext.homeDir, ".config", "opencode", "opencode.json"))
    const openCodeConfig = JSON.parse(opencode!.content.toString("utf8"))
    expect(openCodeConfig).toMatchObject({
      model: "openai/gpt-5.6-sol",
      default_agent: "ms-architect",
      plugin: ["@mohak34/opencode-notifier@0.2.8"],
      mcp: {
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
    expect(
      artifacts.find(
        (artifact) =>
          artifact.kind === "documentation" && artifact.name === "agents-shared.md",
      ),
    ).toBeDefined()
    expect(JSON.parse(tui!.content.toString("utf8"))).toMatchObject({
      plugin: ["opencode-subagent-statusline@1.2.0"],
      attention: { enabled: true, notifications: true, sound: false },
    })
    expect(JSON.parse(notifier!.content.toString("utf8"))).toMatchObject({
      notificationSystem: "osascript",
      suppressWhenFocused: true,
      minDuration: 5,
      events: {
        question: { sound: false, notification: true },
        plan_exit: { sound: false, notification: true },
      },
    })
    expect(opencode!.content.toString("utf8")).not.toMatch(/sk-[A-Za-z0-9]/)
  })

  it("renders Claude agents with inherited models and role restrictions", async () => {
    const artifacts = await buildArtifacts(["claude"], await context())
    const architect = artifacts.find((artifact) => artifact.name === "ms-architect" && artifact.kind === "agent")
    const scout = artifacts.find((artifact) => artifact.name === "ms-scout" && artifact.kind === "agent")
    const continueCommand = artifacts.find(
      (artifact) => artifact.name === "ms-continue" && artifact.kind === "command",
    )
    const commands = artifacts.filter((artifact) => artifact.kind === "command")

    const architectDocument = parseMarkdown(architect!.content.toString("utf8"))
    const scoutDocument = parseMarkdown(scout!.content.toString("utf8"))
    expect(architectDocument.frontmatter).toMatchObject({
      name: "ms-architect",
      model: "inherit",
      permissionMode: "default",
      skills: ["ms-shared"],
    })
    expect(architectDocument.frontmatter.disallowedTools).toEqual(
      expect.arrayContaining(["Write", "Edit", "NotebookEdit"]),
    )
    expect(architectDocument.frontmatter.disallowedTools).not.toContain("Agent")
    expect(scoutDocument.frontmatter.disallowedTools).toEqual(
      expect.arrayContaining(["Write", "Edit", "Agent", "SendMessage", "Skill", "WebSearch"]),
    )
    expect(scoutDocument.frontmatter.maxTurns).toBe(20)
    expect(scoutDocument.frontmatter.hooks).toBeDefined()
    expect(JSON.stringify(architectDocument.frontmatter.hooks)).toContain("SendMessage")
    expect(architectDocument.frontmatter.hooks).not.toHaveProperty("Stop")
    expect(scoutDocument.frontmatter.hooks).toHaveProperty("Stop")

    const designer = artifacts.find(
      (artifact) => artifact.name === "ms-designer" && artifact.kind === "agent",
    )
    const designerDocument = parseMarkdown(designer!.content.toString("utf8"))
    expect(designerDocument.frontmatter.disallowedTools).toEqual(expect.arrayContaining(["Bash", "Agent"]))
    expect(JSON.stringify(designerDocument.frontmatter.hooks)).toContain("ms-agent-guard.mjs")

    const expectedWorkflowAgents = new Map([
      ["ms-continue", "ms-architect"],
      ["ms-doctor", "ms-architect"],
      ["ms-status", "ms-architect"],
    ])
    expect(commands).toHaveLength(expectedWorkflowAgents.size)
    for (const command of commands) {
      expect(parseMarkdown(command.content.toString("utf8")).frontmatter).toMatchObject({
        context: "fork",
        agent: expectedWorkflowAgents.get(command.name),
      })
    }

    const continueDocument = parseMarkdown(continueCommand!.content.toString("utf8"))
    expect(continueDocument.frontmatter).toMatchObject({
      name: "ms-continue",
      "disable-model-invocation": true,
      context: "fork",
      agent: "ms-architect",
    })
    expect(JSON.stringify(continueDocument.frontmatter.hooks)).toContain("ms-agent-guard.mjs")
    expect(continueDocument.body).toContain(
      "Ejecuta este flujo de trabajo con el rol de ms-architect",
    )
    expect(continueDocument.body).toContain("skill `ms-shared`")
    expect(continueDocument.body).not.toContain("Contrato para ms-architect")
    expect(continueDocument.body).not.toContain("# Reglas Compartidas MS")
    expect(continueDocument.body).toContain("# Flujo de trabajo")
  })

  it("renders Codex TOML agents and parent orchestration skills", async () => {
    const buildContext = await context()
    const artifacts = await buildArtifacts(["codex"], buildContext)
    const agents = artifacts.filter((artifact) => artifact.kind === "agent")
    const architectAgent = agents.find((artifact) => artifact.name === "ms-architect")
    const scout = artifacts.find((artifact) => artifact.name === "ms-scout" && artifact.kind === "agent")
    const coder = artifacts.find((artifact) => artifact.name === "ms-codex" && artifact.kind === "agent")
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

    expect(agents).toHaveLength(12)
    expect(architectAgent).toBeUndefined()
    expect(scout!.content.toString("utf8")).toContain('default_permissions = "ms-agent"')
    expect(scout!.content.toString("utf8")).toContain('extends = ":read-only"')
    expect(scout!.content.toString("utf8")).toContain('"**/.env" = "deny"')
    expect(scout!.content.toString("utf8")).toContain('model_reasoning_effort = "low"')
    expect(scout!.content.toString("utf8")).not.toContain("\nmodel = ")
    expect(coder!.content.toString("utf8")).toContain('extends = ":workspace"')
    expect(coder!.content.toString("utf8")).toContain('model_reasoning_effort = "high"')

    const designer = artifacts.find(
      (artifact) => artifact.name === "ms-designer" && artifact.kind === "agent",
    )
    expect(designer!.content.toString("utf8")).toContain('"docs/design/**" = "write"')
    expect(architectSkill!.destination).toContain(path.join(".agents", "skills", "ms-architect", "SKILL.md"))
    expect(parseMarkdown(architectSkill!.content.toString("utf8")).body).toContain(
      "Contrato para ms-architect",
    )
    expect(parseMarkdown(architectSkill!.content.toString("utf8")).body).toContain(
      "Cada `spawn_agent` es una delegación normal",
    )
    expect(context7).toMatchObject({
      destination: path.join(buildContext.projectRoot, ".codex", "config.toml"),
      root: path.join(buildContext.projectRoot, ".codex"),
      strategy: "managed-block",
      blockId: "codex-context7",
      satisfaction: "codex-context7",
      mode: 0o644,
    })
    expect(context7?.content.toString("utf8")).toBe(
      '[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"\n' +
        'env_http_headers = { "CONTEXT7_API_KEY" = "CONTEXT7_API_KEY" }\n',
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
      satisfaction: "codex-context7",
    })
    expect(artifacts.some((artifact) => artifact.destination.endsWith("openai.yaml"))).toBe(false)
  })
})
