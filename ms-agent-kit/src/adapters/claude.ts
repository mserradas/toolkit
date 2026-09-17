import path from "node:path"
import { frontmatterString, renderMarkdown } from "../core/frontmatter.js"
import { resolveAgentModel } from "../core/agent-models.js"
import type { Artifact, BuildContext, Catalog, SourceMarkdown } from "../core/types.js"
import {
  copySkillArtifacts,
  textArtifact,
  projectSharedRules,
  projectVerificationInstructions,
} from "./common.js"

const CLAUDE_COMPATIBILITY = `
- Interpreta task como la herramienta Agent de Claude Code.
- Cada llamada a Agent es una delegación normal acotada al brief actual.
- Interpreta question como AskUserQuestion cuando este disponible; si eres un subagente, devuelve la pregunta bloqueante al padre.
- Las reglas compartidas y el contrato de salida llegan precargados mediante la skill ms-shared.
- Las instrucciones del rol definen su misión. Las herramientas y los permisos se heredan de la configuración nativa de Claude Code; el kit no añade restricciones de acceso.
- Solo ms-architect coordina otros agentes. El resto ejecuta su alcance y devuelve un resumen verificable.
`

function rootFor(context: BuildContext): string {
  return context.scope === "user"
    ? path.join(context.homeDir, ".claude")
    : path.join(context.projectRoot, ".claude")
}

function claudeAgent(agent: SourceMarkdown, context: BuildContext): string {
  const description = frontmatterString(
    agent.frontmatter,
    "description",
    `Agente especializado ${agent.name}`,
  )
  const model = resolveAgentModel(agent.name, "claude", context.kitConfiguration)
  const frontmatter: Record<string, unknown> = {
    name: agent.name,
    description,
    model: model.model ?? "inherit",
    skills: ["ms-shared"],
  }
  if (model.reasoningEffort !== null) {
    frontmatter.effort = model.reasoningEffort
  }

  return renderMarkdown(
    frontmatter,
    `# Compatibilidad Claude Code\n\n${CLAUDE_COMPATIBILITY.trim()}\n\n${projectVerificationInstructions(agent.name, context)}\n\n${agent.body}`,
  )
}

function claudeCommand(
  command: SourceMarkdown,
  agents: SourceMarkdown[],
): string {
  const description = frontmatterString(
    command.frontmatter,
    "description",
    `Ejecuta ${command.name}`,
  )
  const requestedAgent = frontmatterString(command.frontmatter, "agent", "ms-architect")
  const agent = agents.find((candidate) => candidate.name === requestedAgent)
  if (!agent) throw new Error(`El flujo de trabajo ${command.name} referencia el agente inexistente ${requestedAgent}`)
  const frontmatter: Record<string, unknown> = {
    name: command.name,
    description,
    "disable-model-invocation": true,
    context: "fork",
    agent: agent.name,
  }
  return renderMarkdown(
    frontmatter,
    [
      "# Adaptación para Claude Code",
      `Ejecuta este flujo de trabajo con el rol de ${agent.name}. Sus reglas compartidas y contrato llegan mediante la skill \`ms-shared\`. Usa $ARGUMENTS como entrada literal.`,
      "# Flujo de trabajo",
      command.body,
      ...(command.name === "ms-fastlane" ? ["Este fork nativo ejecuta un worker: conserva el contrato interno para el padre, que presenta el resumen al usuario. No invoques ms-architect ni delegues otro agente."] : []),
      ...(command.name === "ms-handoff" ? ["Este comando de Claude se ejecuta en un fork. Si se pidió guardar la nota, devuelve contenido y destino al padre; la tarea principal delega la escritura autorizada a ms-codex. No crees subagentes anidados, no escribas desde el fork y no afirmes que se guardó sin evidencia."] : []),
    ].join("\n\n"),
  )
}

function sharedSkill(sharedRules: string): string {
  return renderMarkdown(
    {
      name: "ms-shared",
      description: "Reglas compartidas y contrato operativo de los agentes ms-*",
      "user-invocable": false,
    },
    sharedRules,
  )
}

export function buildClaudeArtifacts(catalog: Catalog, context: BuildContext): Artifact[] {
  const root = rootFor(context)
  const skillsRoot = path.join(root, "skills")
  const artifacts: Artifact[] = []
  const architect = catalog.agents.find((agent) => agent.name === "ms-architect")
  if (!architect) throw new Error("Falta el agente ms-architect en el catálogo")

  for (const agent of catalog.agents) {
    artifacts.push(
      textArtifact({
        target: "claude",
        kind: "agent",
        name: agent.name,
        root,
        destination: path.join(root, "agents", agent.fileName),
        content: claudeAgent(agent, context),
      }),
    )
  }

  for (const skill of catalog.skills) {
    artifacts.push(...copySkillArtifacts("claude", skill, skillsRoot))
  }

  artifacts.push(
    textArtifact({
      target: "claude",
      kind: "skill",
      name: "ms-shared",
      root,
      destination: path.join(skillsRoot, "ms-shared", "SKILL.md"),
      content: sharedSkill(projectSharedRules(catalog.sharedRules, context)),
    }),
  )

  for (const command of catalog.commands) {
    const renderedCommand = catalog.commandVariants.claude?.find(
      (candidate) => candidate.name === command.name,
    ) ?? command
    artifacts.push(
      textArtifact({
        target: "claude",
        kind: "command",
        name: command.name,
        root,
        destination: path.join(skillsRoot, command.name, "SKILL.md"),
        content: claudeCommand(renderedCommand, catalog.agents),
      }),
    )
  }

  return artifacts
}
