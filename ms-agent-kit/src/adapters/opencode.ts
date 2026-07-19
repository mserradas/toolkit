import path from "node:path"
import { agentDefinition } from "../core/agent-catalog.js"
import { renderMarkdown } from "../core/frontmatter.js"
import { modelProfile } from "../core/model-profiles.js"
import {
  OPENCODE_SECRET_BASH_RULES,
  OPENCODE_SECRET_READ_RULES,
} from "../core/permissions.js"
import { openCodeRolePermission } from "../core/opencode-role-permissions.js"
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

function appendPermissionRules(
  current: unknown,
  trailingRules: Record<string, string>,
): Record<string, unknown> {
  const base =
    typeof current === "object" && current !== null && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : { "*": current ?? "allow" }
  return { ...base, ...trailingRules }
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
        skill: "allow",
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

function secureFrontmatter(
  agentName: string,
  frontmatter: Record<string, unknown>,
  context: BuildContext,
): Record<string, unknown> {
  if (frontmatter.permission !== undefined) {
    throw new Error(`El recurso (asset) ${agentName} no debe definir \`permission\`; usa la política central`)
  }
  const currentPermission = openCodeRolePermission(agentName, context.permissionProfile ?? "balanced")
  return {
    ...frontmatter,
    permission: {
      ...currentPermission,
      bash: appendPermissionRules(currentPermission.bash, OPENCODE_SECRET_BASH_RULES),
      read: { ...OPENCODE_SECRET_READ_RULES },
      // Evita que OpenCode prolongue automaticamente una ejecucion que ya esta atascada.
      doom_loop: "deny",
      skill: currentPermission.skill,
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
      color: definition.openCodeColor,
      ...(definition.toolCycleBudget === undefined
        ? {}
        : { steps: definition.toolCycleBudget }),
    }
    const body = embeddedAgentBody(catalog.sharedRules, agent.body, OPENCODE_COMPATIBILITY)
    artifacts.push(
      textArtifact({
        target: "opencode",
        kind: "agent",
        name: agent.name,
        root,
        destination: path.join(root, "agents", agent.fileName),
        content: renderMarkdown(secureFrontmatter(agent.name, frontmatter, context), body),
      }),
    )
  }

  for (const command of catalog.commands) {
    const renderedCommand = catalog.commandVariants.opencode?.find(
      (candidate) => candidate.name === command.name,
    ) ?? command
    artifacts.push(
      textArtifact({
        target: "opencode",
        kind: "command",
        name: command.name,
        root,
        destination: path.join(root, "commands", command.fileName),
        content: renderMarkdown(renderedCommand.frontmatter, renderedCommand.body),
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
