import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildArtifacts } from "../src/adapters/index.js"
import { AGENT_DEFINITIONS, agentDefinition } from "../src/core/agent-catalog.js"
import { DEFAULT_ASSETS_ROOT, loadCatalog } from "../src/core/catalog.js"
import { parseMarkdown } from "../src/core/frontmatter.js"
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
    const artifacts = await buildArtifacts(["opencode", "claude", "codex"], await context())
    const counts = Object.fromEntries(
      ["opencode", "claude", "codex"].map((target) => [
        target,
        artifacts.filter((artifact) => owningTargets(artifact).includes(target)).length,
      ]),
    )

    expect(counts).toEqual({ opencode: 33, claude: 29, codex: 29 })
    expect(artifacts).toHaveLength(91)
    expect(new Set(artifacts.map((artifact) => artifact.destination)).size).toBe(artifacts.length)
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
  })

  it("keeps OpenCode models and embeds the shared contract", async () => {
    const buildContext = await context()
    const artifacts = await buildArtifacts(["opencode"], buildContext)
    const agents = artifacts.filter((artifact) => artifact.kind === "agent")
    const architect = artifacts.find(
      (artifact) => artifact.kind === "agent" && artifact.name === "ms-architect",
    )

    expect(agents).toHaveLength(13)
    const agentsWithSharedSkills = new Set(["ms-architect", "ms-designer", "ms-spec", "ms-writer"])
    for (const agent of agents) {
      const document = parseMarkdown(agent.content.toString("utf8"))
      expect(Object.keys(document.frontmatter).sort()).toEqual([
        "description",
        "mode",
        "model",
        "permission",
        "variant",
      ])
      const permission = document.frontmatter.permission as Record<string, unknown>
      expect(permission.skill).toEqual(
        agentsWithSharedSkills.has(agent.name) ? "allow" : "deny",
      )
    }
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
      read: {
        ".env": "deny",
        "**/.env": "deny",
        "**/secrets/**": "deny",
      },
      bash: {
        env: "deny",
        "* .env": "deny",
        "* **/*.pem": "deny",
        "*": "deny",
        "git diff*": "allow",
      },
    })
    expect(parsed.body).toContain("# Reglas Compartidas MS")
    expect(parsed.body).toContain("Contrato para ms-architect")
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
  })

  it("builds a reproducible global OpenCode configuration without secrets", async () => {
    const buildContext = await context("user")
    const artifacts = await buildArtifacts(["opencode"], buildContext)
    const configurations = artifacts.filter((artifact) => artifact.kind === "configuration")
    const opencode = configurations.find((artifact) => artifact.name === "opencode.json")
    const tui = configurations.find((artifact) => artifact.name === "tui.json")
    const packageFile = configurations.find((artifact) => artifact.name === "package.json")
    const notifier = configurations.find((artifact) => artifact.name === "opencode-notifier.json")

    expect(artifacts).toHaveLength(34)
    expect(configurations).toHaveLength(4)
    expect(opencode?.destination).toBe(path.join(buildContext.homeDir, ".config", "opencode", "opencode.json"))
    expect(JSON.parse(opencode!.content.toString("utf8"))).toMatchObject({
      model: "openai/gpt-5.6-sol",
      default_agent: "ms-architect",
      plugin: ["@warp-dot-dev/opencode-warp@0.1.7", "@mohak34/opencode-notifier@0.2.8"],
      mcp: {
        context7: {
          headers: { CONTEXT7_API_KEY: "{env:CONTEXT7_API_KEY}" },
        },
      },
      permission: {
        read: { "**/.env": "deny" },
        skill: "allow",
      },
    })
    expect(JSON.parse(tui!.content.toString("utf8"))).toMatchObject({
      plugin: ["opencode-subagent-statusline@1.2.0"],
      attention: { enabled: true, notifications: true, sound: false },
    })
    expect(JSON.parse(packageFile!.content.toString("utf8"))).toMatchObject({
      dependencies: { "@opencode-ai/plugin": "1.17.18" },
    })
    expect(JSON.parse(notifier!.content.toString("utf8"))).toMatchObject({
      notificationSystem: "osascript",
      minDuration: 5,
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
      expect.arrayContaining(["Write", "Edit", "Agent", "Skill", "WebSearch"]),
    )
    expect(scoutDocument.frontmatter.hooks).toBeDefined()

    const designer = artifacts.find(
      (artifact) => artifact.name === "ms-designer" && artifact.kind === "agent",
    )
    const designerDocument = parseMarkdown(designer!.content.toString("utf8"))
    expect(designerDocument.frontmatter.disallowedTools).toEqual(expect.arrayContaining(["Bash", "Agent"]))
    expect(JSON.stringify(designerDocument.frontmatter.hooks)).toContain("ms-agent-guard.mjs")

    const continueDocument = parseMarkdown(continueCommand!.content.toString("utf8"))
    expect(continueDocument.frontmatter).toMatchObject({
      name: "ms-continue",
      "disable-model-invocation": true,
    })
    expect(continueDocument.frontmatter).not.toHaveProperty("context")
    expect(continueDocument.frontmatter).not.toHaveProperty("agent")
    expect(JSON.stringify(continueDocument.frontmatter.hooks)).toContain("ms-agent-guard.mjs")
    expect(continueDocument.body).toContain("conversacion principal")
    expect(continueDocument.body).toContain("Contrato para ms-architect")
    expect(continueDocument.body).toContain("# Workflow")
  })

  it("renders Codex TOML agents and parent orchestration skills", async () => {
    const artifacts = await buildArtifacts(["codex"], await context())
    const agents = artifacts.filter((artifact) => artifact.kind === "agent")
    const architectAgent = agents.find((artifact) => artifact.name === "ms-architect")
    const scout = artifacts.find((artifact) => artifact.name === "ms-scout" && artifact.kind === "agent")
    const coder = artifacts.find((artifact) => artifact.name === "ms-codex" && artifact.kind === "agent")
    const architectSkill = artifacts.find(
      (artifact) => artifact.name === "ms-architect" && artifact.kind === "skill",
    )
    const skillCreator = artifacts.find(
      (artifact) => artifact.name === "ms-skill-creator" && artifact.kind === "skill",
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
    expect(parseMarkdown(skillCreator!.content.toString("utf8")).frontmatter.name).toBe(
      "ms-skill-creator",
    )
    expect(skillCreator!.destination).toContain(
      path.join(".agents", "skills", "ms-skill-creator", "SKILL.md"),
    )
    expect(secretRules!.destination).toContain(path.join(".codex", "rules", "ms-secrets.rules"))
    expect(secretRules!.content.toString("utf8")).toContain('decision = "forbidden"')
    expect(secretRules!.content.toString("utf8")).toContain('match = ["cat .env"')
    expect(secretRules!.content.toString("utf8")).toContain('not_match = ["cat .env.example"')
  })
})
