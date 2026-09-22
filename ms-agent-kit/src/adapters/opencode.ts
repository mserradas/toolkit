import path from "node:path"
import { agentDefinition } from "../core/agent-catalog.js"
import { renderMarkdown } from "../core/frontmatter.js"
import { resolveAgentModel } from "../core/agent-models.js"
import type { Artifact, BuildContext, Catalog } from "../core/types.js"
import {
  copySkillArtifacts,
  embeddedAgentBody,
  textArtifact,
  projectSharedRules,
  projectVerificationInstructions,
} from "./common.js"

const OPENCODE_COMPATIBILITY = `
- Este archivo es autocontenido: las reglas de docs/agents-shared.md estan incorporadas arriba.
- Conserva los nombres nativos de herramientas, permisos, modelos y variantes de OpenCode.
- El archivo docs/agents-shared.md tambien se instala como referencia humana, pero no es necesario cargarlo otra vez.
- El kit genera permission: {} en OpenCode, sin restricciones adicionales. Los límites de cada rol son instrucciones de trabajo. Los permisos efectivos dependen de los valores nativos y de la configuración externa del cliente.
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

function openCodeConfig(context: BuildContext): string {
  const defaultModel = resolveAgentModel(OPENCODE_DEFAULT_AGENT, "opencode", context.kitConfiguration)
  return `${JSON.stringify(
    {
      $schema: "https://opencode.ai/config.json",
      model: defaultModel.model,
      default_agent: OPENCODE_DEFAULT_AGENT,
      permission: {},
      mcp: {
        playwright: {
          type: "local",
          command: ["npx", "-y", "@playwright/mcp@latest"],
          enabled: true,
        },
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

function agentFrontmatter(
  agentName: string,
  frontmatter: Record<string, unknown>,
): Record<string, unknown> {
  if (frontmatter.permission !== undefined) {
    throw new Error(`El recurso (asset) ${agentName} no debe definir \`permission\`; OpenCode se genera sin restricciones del kit`)
  }
  return {
    ...frontmatter,
    permission: {},
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
      content: openCodeConfig(context),
    }),
  )

  for (const file of catalog.openCodeConfigFiles) {
    const destinationRoot =
      file.relativePath === "package.json" || file.relativePath.startsWith("themes/") ? root : configRoot
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
    const model = resolveAgentModel(agent.name, "opencode", context.kitConfiguration)
    const frontmatter = {
      ...agent.frontmatter,
      mode: definition.mode,
      model: model.model,
      variant: model.reasoningEffort,
      color: definition.openCodeColor,
    }
    const body = embeddedAgentBody(projectSharedRules(catalog.sharedRules, context), [projectVerificationInstructions(agent.name, context), agent.body].filter(Boolean).join("\n\n"), OPENCODE_COMPATIBILITY)
    artifacts.push(
      textArtifact({
        target: "opencode",
        kind: "agent",
        name: agent.name,
        root,
        destination: path.join(root, "agents", agent.fileName),
        content: renderMarkdown(agentFrontmatter(agent.name, frontmatter), body),
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
