import path from "node:path"
import { agentDefinition } from "../core/agent-catalog.js"
import { frontmatterString, renderMarkdown } from "../core/frontmatter.js"
import { resolveAgentModel } from "../core/agent-models.js"
import { capabilityProfile, COORDINATION_SKILLS, technicalSkillsOnly } from "../core/profiles.js"
import type { Artifact, BuildContext, Catalog, SourceMarkdown } from "../core/types.js"
import {
  copySharedSkillArtifacts,
  embeddedAgentBody,
  textArtifact,
  projectSharedRules,
  projectVerificationInstructions,
} from "./common.js"

const CODEX_COMPATIBILITY = `
- Interpreta \`task\` como una delegación a un agente personalizado (\`custom agent\`) de Codex.
- Cada \`spawn_agent\` es una delegación normal acotada al brief actual.
- Interpreta \`question\` como una pregunta directa al usuario desde la tarea padre.
- Las instrucciones del rol definen su misión; los permisos técnicos corresponden a la configuración nativa y al sandbox de Codex.
- El kit no añade perfiles de permisos, reglas de comandos ni límites de herramientas. Se hereda la configuración nativa de la tarea padre; conserva el alcance funcional del rol.
- El agente padre conserva las decisiones y el cierre; los subagentes devuelven solo el resumen y las evidencias.
- No crees delegaciones recursivas: la tarea padre coordina agentes directos con un alcance cerrado.
- No leas archivos de secretos ni vuelques variables de entorno. Si falta un dato sensible, pide al usuario una entrada saneada; no intentes eludir las reglas de seguridad con otro comando o intérprete.
`

const CODEX_SKILL_EXCLUSIONS = new Set(["skill-creator"])

const CODEX_CONTEXT7_CONFIG = `[mcp_servers.context7]
url = "https://mcp.context7.com/mcp"
env_http_headers = { "CONTEXT7_API_KEY" = "CONTEXT7_API_KEY" }
`

const CODEX_PLAYWRIGHT_CONFIG = `[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@latest"]
`

function rootsFor(context: BuildContext): { codex: string; skills: string } {
  if (context.scope === "user") {
    return {
      codex: path.join(context.homeDir, ".codex"),
      skills: path.join(context.homeDir, ".codex", "skills"),
    }
  }
  return {
    codex: path.join(context.projectRoot, ".codex"),
    skills: path.join(context.projectRoot, ".agents", "skills"),
  }
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

function codexOperationalInstructions(
  definition: ReturnType<typeof agentDefinition>,
  profile: ReturnType<typeof capabilityProfile>,
): string {
  const instructions: string[] = []
  if (definition.mode !== "primary" || !profile.asksQuestions) {
    instructions.push(
      "No preguntes directamente al usuario aunque la herramienta siga visible; devuelve al agente padre cualquier pregunta cuya respuesta cambie el resultado.",
    )
  }
  if (!profile.orchestrates) {
    instructions.push(
      "No crees ni actualices planes o TODOs del cliente; el plan pertenece al agente orquestador.",
      "No delegues ni coordines otros agentes aunque las herramientas sigan visibles; devuelve el control al agente padre cuando haga falta coordinación.",
    )
  }
  if (!profile.usesSkills) {
    instructions.push("No cargues ni invoques skills aunque el catálogo siga visible.")
  }
  if (technicalSkillsOnly(definition.capabilityProfile)) instructions.push(`Puedes cargar skills técnicas seleccionadas en el brief o en preferences.technicalSkills. No cargues protocolos de coordinación: ${COORDINATION_SKILLS.join(", ")}. No precargues todo el catálogo.`)
  if (instructions.length === 0) return ""
  return ["# Límites Operativos De Codex", ...instructions.map((item) => `- ${item}`)].join("\n")
}

function codexAgent(agent: SourceMarkdown, sharedRules: string, context: BuildContext): string {
  const definition = agentDefinition(agent.name)
  const profile = capabilityProfile(definition.capabilityProfile)
  const model = resolveAgentModel(agent.name, "codex", context.kitConfiguration)
  const description = frontmatterString(
    agent.frontmatter,
    "description",
    `Agente especializado ${agent.name}`,
  )
  const documentationLimit = agent.name === "ms-writer" && context.scope === "project" && context.projectPreferences?.documentation.paths.length
    ? "En los directorios de preferences.documentation.paths escribe únicamente archivos Markdown dentro del alcance documental autorizado."
    : ""
  const roleInstructions = [codexOperationalInstructions(definition, profile), documentationLimit, projectVerificationInstructions(agent.name, context), agent.body]
    .filter(Boolean)
    .join("\n\n")
  const instructions = embeddedAgentBody(sharedRules, roleInstructions, CODEX_COMPATIBILITY)
  const lines = [
    `name = ${tomlString(agent.name)}`,
    `description = ${tomlString(description)}`,
  ]
  if (model.model !== null) lines.push(`model = ${tomlString(model.model)}`)
  if (model.reasoningEffort !== null) lines.push(`model_reasoning_effort = ${tomlString(model.reasoningEffort)}`)
  lines.push(`developer_instructions = ${tomlString(instructions)}`)
  return `${lines.join("\n")}\n`
}

function codexSkill(name: string, description: string, body: string): string {
  return renderMarkdown({ name, description }, body)
}

function commandSkill(command: SourceMarkdown, catalog: Catalog, context: BuildContext): string {
  const description = frontmatterString(
    command.frontmatter,
    "description",
    `Ejecuta ${command.name}`,
  )
  if (command.name === "ms-fastlane") {
    const fastlane = catalog.agents.find((agent) => agent.name === "ms-fastlane")
    if (!fastlane) throw new Error("Falta ms-fastlane en el catálogo")
    const definition = agentDefinition(fastlane.name)
    const limits = codexOperationalInstructions(definition, capabilityProfile(definition.capabilityProfile)).replace("No preguntes directamente al usuario aunque la herramienta siga visible; devuelve al agente padre cualquier pregunta cuya respuesta cambie el resultado.", "Si falta una decisión bloqueante, pregunta al usuario; esta es una invocación primaria directa.")
    return codexSkill(command.name, description, embeddedAgentBody(projectSharedRules(catalog.sharedRules, context), `${limits}\n\n${projectVerificationInstructions(fastlane.name, context)}\n\n${fastlane.body}\n\nEjecuta directamente el cambio acotado autorizado y su verificación. No invoques ms-architect ni delegues otro worker. En esta invocación primaria entrega el resultado al usuario, sin contrato de worker obligatorio. Usa $ARGUMENTS como entrada literal.`, CODEX_COMPATIBILITY))
  }
  const introduction = command.name === "ms-handoff" ? "Prepara una nota de traspaso en la tarea padre; lectura por defecto y persistencia delegada solo con ruta explícita. Usa $ARGUMENTS como entrada literal." : "Ejecuta este flujo de trabajo de solo lectura en la tarea padre. Usa $ARGUMENTS como entrada literal."
  const codexBody = command.body.replaceAll(`/${command.name}`, `$${command.name}`)
  const body = [
    "# Adaptación para Codex",
    introduction,
    "# Flujo de trabajo",
    codexBody,
  ].join("\n\n")
  return codexSkill(command.name, description, body)
}

export function buildCodexArtifacts(catalog: Catalog, context: BuildContext): Artifact[] {
  const roots = rootsFor(context)
  const artifacts: Artifact[] = []

  for (const agent of catalog.agents) {
    if (agent.name === "ms-architect") continue
    artifacts.push(
      textArtifact({
        target: "codex",
        kind: "agent",
        name: agent.name,
        root: roots.codex,
        destination: path.join(roots.codex, "agents", `${agent.name}.toml`),
        content: codexAgent(agent, projectSharedRules(catalog.sharedRules, context), context),
      }),
    )
  }

  for (const skill of catalog.skills) {
    if (CODEX_SKILL_EXCLUSIONS.has(skill.name)) continue
    artifacts.push(...copySharedSkillArtifacts("codex", skill, roots.skills))
  }

  artifacts.push(
    {
      ...textArtifact({
        target: "codex",
        kind: "configuration",
        name: "context7",
        root: roots.codex,
        destination: path.join(roots.codex, "config.toml"),
        content: CODEX_CONTEXT7_CONFIG + "\n" + CODEX_PLAYWRIGHT_CONFIG,
      }),
      strategy: "managed-block",
      // Preserve the block identity so existing Context7 installations upgrade in place.
      blockId: "codex-context7",
      satisfaction: "codex-mcp",
      mcpServers: [
        { name: "context7", content: CODEX_CONTEXT7_CONFIG },
        { name: "playwright", content: CODEX_PLAYWRIGHT_CONFIG },
      ],
    },
  )

  const architect = catalog.agents.find((agent) => agent.name === "ms-architect")
  if (!architect) throw new Error("Falta el agente ms-architect en el catálogo")
  artifacts.push(
    textArtifact({
      target: "codex",
      kind: "skill",
      name: "ms-architect",
      root: roots.skills,
      destination: path.join(roots.skills, "ms-architect", "SKILL.md"),
      content: codexSkill(
        "ms-architect",
        "Activa el flujo orquestado ms-* en la tarea principal de Codex",
        embeddedAgentBody(projectSharedRules(catalog.sharedRules, context), architect.body, CODEX_COMPATIBILITY),
      ),
    }),
  )

  for (const command of catalog.commands) {
    const renderedCommand = catalog.commandVariants.codex?.find(
      (candidate) => candidate.name === command.name,
    ) ?? command
    artifacts.push(
      textArtifact({
        target: "codex",
        kind: "command",
        name: command.name,
        root: roots.skills,
        destination: path.join(roots.skills, command.name, "SKILL.md"),
        content: commandSkill(renderedCommand, catalog, context),
      }),
    )
  }

  return artifacts
}
