import path from "node:path"
import { agentDefinition } from "../core/agent-catalog.js"
import { renderMarkdown } from "../core/frontmatter.js"
import { modelProfile } from "../core/model-profiles.js"
import {
  OPENCODE_SECRET_BASH_RULES,
  OPENCODE_SECRET_READ_RULES,
} from "../core/permissions.js"
import { openCodeRolePermission } from "../core/opencode-role-permissions.js"
import { restrictOpenCodeSkillPermission } from "../core/skill-visibility.js"
import type { Artifact, BuildContext, Catalog } from "../core/types.js"
import {
  copySkillArtifacts,
  embeddedAgentBody,
  textArtifact,
} from "./common.js"

const OPENCODE_COMPATIBILITY = `
- Este archivo es autocontenido: las reglas de docs/agents-shared.md estan incorporadas arriba.
- Conserva los nombres nativos de herramientas, permisos, modelos y variantes de OpenCode.
- El archivo docs/agents-shared.md tambien se instala como referencia humana, pero no es necesario cargarlo otra vez.
`

const OPENCODE_DEFAULT_AGENT = "ms-architect"

function rootFor(context: BuildContext): string {
  return context.scope === "user"
    ? path.join(context.homeDir, ".config", "opencode")
    : path.join(context.projectRoot, ".opencode")
}

function configRootFor(context: BuildContext): string {
  return context.scope === "user" ? rootFor(context) : context.projectRoot
}

function openCodeConfig(): string {
  const defaultAgent = agentDefinition(OPENCODE_DEFAULT_AGENT)
  const defaultModel = modelProfile(defaultAgent.modelProfile)
  return `${JSON.stringify(
    {
      $schema: "https://opencode.ai/config.json",
      model: defaultModel.openCodeModel,
      default_agent: OPENCODE_DEFAULT_AGENT,
      plugin: ["@mohak34/opencode-notifier@0.2.8"],
      permission: {
        bash: OPENCODE_SECRET_BASH_RULES,
        read: OPENCODE_SECRET_READ_RULES,
        skill: restrictOpenCodeSkillPermission("allow"),
        ms_skill_registry_refresh: "deny",
        ms_workflow_status: "deny",
        ms_workflow_next: "deny",
        ms_review_fingerprint: "deny",
      },
      mcp: {
        context7: {
          type: "remote",
          url: "https://mcp.context7.com/mcp",
          enabled: true,
          headers: {
            CONTEXT7_API_KEY: "{env:CONTEXT7_API_KEY}",
          },
        },
      },
    },
    null,
    2,
  )}\n`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function secureRule(
  current: unknown,
  denials: Record<string, unknown>,
): Record<string, unknown> | "deny" {
  if (current === "deny") return "deny"
  if (isRecord(current)) return { ...current, ...denials }
  if (current === "allow" || current === "ask") return { "*": current, ...denials }
  return { ...denials }
}

function secureFrontmatter(
  agentName: string,
  frontmatter: Record<string, unknown>,
): Record<string, unknown> {
  if (frontmatter.permission !== undefined) {
    throw new Error(`El asset ${agentName} no debe definir permission; usa la politica central`)
  }
  const currentPermission = openCodeRolePermission(agentName)
  return {
    ...frontmatter,
    permission: {
      ...currentPermission,
      skill: restrictOpenCodeSkillPermission(currentPermission.skill),
      read: secureRule(currentPermission.read, OPENCODE_SECRET_READ_RULES),
      bash: secureRule(currentPermission.bash, OPENCODE_SECRET_BASH_RULES),
    },
  }
}

export function buildOpenCodeArtifacts(catalog: Catalog, context: BuildContext): Artifact[] {
  const root = rootFor(context)
  const configRoot = configRootFor(context)
  const artifacts: Artifact[] = []

  artifacts.push(
    textArtifact({
      target: "opencode",
      kind: "configuration",
      name: "opencode.json",
      root: configRoot,
      destination: path.join(configRoot, "opencode.json"),
      content: openCodeConfig(),
    }),
  )

  for (const file of catalog.openCodeConfigFiles) {
    if (context.scope === "project" && file.relativePath === "opencode-notifier.json") continue
    const destinationRoot =
      file.relativePath === "package.json" ? root : configRoot
    artifacts.push(
      textArtifact({
        target: "opencode",
        kind: "configuration",
        name: file.relativePath,
        root: destinationRoot,
        destination: path.join(destinationRoot, file.relativePath),
        content: file.content,
        mode: file.mode,
      }),
    )
  }

  for (const agent of catalog.agents) {
    const definition = agentDefinition(agent.name)
    const model = modelProfile(definition.modelProfile)
    const frontmatter = {
      ...agent.frontmatter,
      mode: definition.mode,
      model: model.openCodeModel,
      variant: model.reasoningEffort,
    }
    const body = embeddedAgentBody(catalog.sharedRules, agent.body, OPENCODE_COMPATIBILITY)
    artifacts.push(
      textArtifact({
        target: "opencode",
        kind: "agent",
        name: agent.name,
        root,
        destination: path.join(root, "agents", agent.fileName),
        content: renderMarkdown(secureFrontmatter(agent.name, frontmatter), body),
      }),
    )
  }

  for (const command of catalog.commands) {
    artifacts.push(
      textArtifact({
        target: "opencode",
        kind: "command",
        name: command.name,
        root,
        destination: path.join(root, "commands", command.fileName),
        content: renderMarkdown(command.frontmatter, command.body),
      }),
    )
  }

  for (const skill of catalog.skills) {
    artifacts.push(...copySkillArtifacts("opencode", skill, path.join(root, "skills")))
  }

  for (const file of catalog.documentation) {
    artifacts.push(
      textArtifact({
        target: "opencode",
        kind: "documentation",
        name: file.relativePath,
        root,
        destination: path.join(root, "docs", file.relativePath),
        content: file.content,
        mode: file.mode,
      }),
    )
  }

  for (const file of catalog.openCodePlugins) {
    artifacts.push(
      textArtifact({
        target: "opencode",
        kind: "plugin",
        name: file.relativePath,
        root,
        destination: path.join(root, "plugins", file.relativePath),
        content: file.content,
        mode: file.mode,
      }),
    )
  }

  return artifacts
}
