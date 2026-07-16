import path from "node:path"
import { agentDefinition } from "../core/agent-catalog.js"
import { frontmatterString, renderMarkdown } from "../core/frontmatter.js"
import { modelProfile } from "../core/model-profiles.js"
import { SECRET_PATH_PATTERNS } from "../core/permissions.js"
import { capabilityProfile } from "../core/profiles.js"
import type { Artifact, BuildContext, Catalog, SourceMarkdown } from "../core/types.js"
import {
  copySharedSkillArtifacts,
  embeddedAgentBody,
  textArtifact,
} from "./common.js"

const CODEX_COMPATIBILITY = `
- Interpreta task como delegacion a un custom agent de Codex.
- Interpreta question como una pregunta directa al usuario desde la tarea padre.
- Las referencias a permission.task o herramientas de OpenCode son limites de rol, no sintaxis TOML.
- Codex no permite desactivar Bash, preguntas al usuario ni el catalogo global de skills por custom agent. Respeta esos limites del rol como instrucciones obligatorias aunque la herramienta siga visible.
- web_search es la unica capacidad web materializada por agente y sigue la capacidad webSearch del perfil. Codex no separa WebFetch: si el rol permite webFetch pero no webSearch, usa una fuente ya aportada o Context7 y devuelve al padre cualquier consulta que requiera busqueda; no eludas el limite.
- Los permisos y overrides activos de la tarea padre pueden prevalecer sobre el perfil del custom agent. No interpretes un permiso mas amplio heredado como autorizacion para ampliar el rol.
- El agente padre mantiene decisiones y cierre; los subagentes devuelven solo resumen y evidencia.
- No crees delegacion recursiva: la tarea padre coordina agentes directos con alcance cerrado.
- No leas archivos de secretos ni vuelques variables de entorno. Si falta un dato sensible, pide al usuario una entrada sanitizada; no intentes eludir las reglas de seguridad con otro comando o interprete.
`

const CODEX_SECRET_ARGUMENTS = [
  ".env",
  "./.env",
  ".env.local",
  "./.env.local",
  ".env.secret",
  "./.env.secret",
  ".env.development",
  "./.env.development",
  ".env.production",
  "./.env.production",
  ".env.staging",
  "./.env.staging",
  ".env.test",
  "./.env.test",
  ".netrc",
  "./.netrc",
  ".npmrc",
  "./.npmrc",
  ".pypirc",
  "./.pypirc",
  ".aws/credentials",
  "./.aws/credentials",
  ".config/gh/hosts.yml",
  "./.config/gh/hosts.yml",
  ".docker/config.json",
  "./.docker/config.json",
  ".kube/config",
  "./.kube/config",
  ".ssh/id_rsa",
  "./.ssh/id_rsa",
  ".ssh/id_ed25519",
  "./.ssh/id_ed25519",
  "credentials.json",
  "./credentials.json",
] as const

const CODEX_DIRECT_READERS = [
  "cat",
  "/bin/cat",
  "/usr/bin/cat",
  "bat",
  "head",
  "/usr/bin/head",
  "tail",
  "/usr/bin/tail",
  "less",
  "more",
  "source",
  ".",
] as const

const CODEX_LINE_READERS = [
  "head",
  "/bin/head",
  "/usr/bin/head",
  "tail",
  "/bin/tail",
  "/usr/bin/tail",
] as const
const CODEX_LINE_COUNTS = ["1", "2", "5", "10", "20", "50", "100", "+1"] as const
const CODEX_SHORT_LINE_FLAGS = ["-1", "-2", "-5", "-10", "-20", "-50", "-100"] as const
const CODEX_TEXT_FILTERS = ["sed", "/usr/bin/sed"] as const
const CODEX_RECORD_FILTERS = ["awk", "/usr/bin/awk"] as const
const CODEX_SEARCH_READERS = ["rg", "grep", "/usr/bin/grep"] as const
const CODEX_SEARCH_FLAGS = ["-n", "--line-number"] as const
const CODEX_SED_PROGRAMS = ["p", "1p", "2p", "1,20p", "1,50p", "1,100p", "1,200p"] as const
const CODEX_AWK_PROGRAMS = [
  "{print}",
  "{print $0}",
  "1",
  "/DATABASE_URL/",
  "/TOKEN/",
  "/API_KEY/",
  "/SECRET/",
  "/PASSWORD/",
] as const
const CODEX_SECRET_SEARCH_TERMS = [
  "DATABASE_URL",
  "TOKEN",
  "API_TOKEN",
  "KEY",
  "API_KEY",
  "SECRET",
  "PASSWORD",
  "PASS",
  ".",
  ".+",
] as const
const CODEX_GIT_OBJECT_ARGUMENTS = CODEX_SECRET_ARGUMENTS.filter(
  (argument) => !argument.startsWith("./"),
).flatMap((argument) => [`HEAD:${argument}`, `HEAD~1:${argument}`])

function rootsFor(context: BuildContext): { codex: string; skills: string } {
  if (context.scope === "user") {
    return {
      codex: path.join(context.homeDir, ".codex"),
      skills: path.join(context.homeDir, ".agents", "skills"),
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

function codexWritePaths(writePaths: readonly string[]): string[] {
  return [
    ...new Set(
      writePaths.map((writePath) => {
        if (writePath.endsWith("/**/*.md")) return `${writePath.slice(0, -"/**/*.md".length)}/**`
        if (writePath.endsWith("/*.md")) return `${writePath.slice(0, -"/*.md".length)}/**`
        return writePath
      }),
    ),
  ]
}

function codexAgent(agent: SourceMarkdown, sharedRules: string): string {
  const definition = agentDefinition(agent.name)
  const profile = capabilityProfile(definition.capabilityProfile)
  const model = modelProfile(definition.modelProfile)
  const description = frontmatterString(
    agent.frontmatter,
    "description",
    `Agente especializado ${agent.name}`,
  )
  const instructions = embeddedAgentBody(sharedRules, agent.body, CODEX_COMPATIBILITY)
  const lines = [
    `name = ${tomlString(agent.name)}`,
    `description = ${tomlString(description)}`,
    `default_permissions = "ms-agent"`,
  ]
  lines.push(`model_reasoning_effort = ${tomlString(model.reasoningEffort)}`)
  lines.push(`web_search = ${tomlString(profile.webSearch ? "cached" : "disabled")}`)
  lines.push(`developer_instructions = ${tomlString(instructions)}`)
  lines.push("", "[permissions.ms-agent]")
  lines.push(`description = ${tomlString(`Permisos acotados para ${agent.name}`)}`)
  lines.push(`extends = ${tomlString(profile.writePaths.includes("**") ? ":workspace" : ":read-only")}`)
  lines.push("", '[permissions.ms-agent.filesystem.":workspace_roots"]')
  for (const writePath of codexWritePaths(profile.writePaths)) {
    if (writePath !== "**") lines.push(`${tomlString(writePath)} = "write"`)
  }
  for (const secretPath of SECRET_PATH_PATTERNS) {
    lines.push(`${tomlString(secretPath)} = "deny"`)
  }
  return `${lines.join("\n")}\n`
}

function codexSkill(name: string, description: string, body: string): string {
  return renderMarkdown({ name, description }, body)
}

function starlarkStrings(values: readonly string[]): string {
  return `[${values.map(tomlString).join(", ")}]`
}

function codexSecretRules(): string {
  return `# Política ms-* administrada. Defensa practica best-effort para lecturas directas habituales.
# prefix_rule usa prefijos exactos: estas reglas no son un sandbox ni cubren interpretes,
# opciones, cantidades, programas o patrones no enumerados. No se deniegan globalmente
# head, sed, awk, rg ni grep porque tambien tienen usos seguros. .env.example se mantiene permitido.
prefix_rule(
    pattern = [${starlarkStrings(CODEX_DIRECT_READERS)}, ${starlarkStrings(CODEX_SECRET_ARGUMENTS)}],
    decision = "forbidden",
    justification = "Ruta sensible bloqueada. Solicita al usuario una entrada sanitizada.",
    match = ["cat .env", "head .env.local", "source .env"],
    not_match = ["cat .env.example", "cat README.md"],
)

prefix_rule(
    pattern = [${starlarkStrings(CODEX_LINE_READERS)}, ["-n", "--lines"], ${starlarkStrings(CODEX_LINE_COUNTS)}, ${starlarkStrings(CODEX_SECRET_ARGUMENTS)}],
    decision = "forbidden",
    justification = "Ruta sensible bloqueada. Solicita al usuario una entrada sanitizada.",
    match = ["head -n 1 .env", "tail --lines 20 .env.secret"],
    not_match = ["head -n 1 .env.example", "head -n 20 README.md"],
)

prefix_rule(
    pattern = [${starlarkStrings(CODEX_LINE_READERS)}, ["-c", "--bytes"], ${starlarkStrings(CODEX_LINE_COUNTS)}, ${starlarkStrings(CODEX_SECRET_ARGUMENTS)}],
    decision = "forbidden",
    justification = "Ruta sensible bloqueada. Solicita al usuario una entrada sanitizada.",
    match = ["head -c 50 .env", "tail --bytes 20 .env.secret"],
    not_match = ["head -c 50 .env.example", "head -c 50 README.md"],
)

prefix_rule(
    pattern = [${starlarkStrings(CODEX_LINE_READERS)}, ${starlarkStrings(CODEX_SHORT_LINE_FLAGS)}, ${starlarkStrings(CODEX_SECRET_ARGUMENTS)}],
    decision = "forbidden",
    justification = "Ruta sensible bloqueada. Solicita al usuario una entrada sanitizada.",
    match = ["head -5 .env", "tail -20 .env.secret"],
    not_match = ["head -5 .env.example", "head -20 README.md"],
)

prefix_rule(
    pattern = [${starlarkStrings(CODEX_TEXT_FILTERS)}, ["-n", "--quiet", "--silent"], ${starlarkStrings(CODEX_SED_PROGRAMS)}, ${starlarkStrings(CODEX_SECRET_ARGUMENTS)}],
    decision = "forbidden",
    justification = "No filtres contenido de archivos sensibles.",
    match = ["sed -n 1p .env", "sed --quiet 1,20p .env.secret"],
    not_match = ["sed -n 1p .env.example", "sed -n 1p README.md"],
)

prefix_rule(
    pattern = [${starlarkStrings(CODEX_RECORD_FILTERS)}, ${starlarkStrings(CODEX_AWK_PROGRAMS)}, ${starlarkStrings(CODEX_SECRET_ARGUMENTS)}],
    decision = "forbidden",
    justification = "No proceses contenido de archivos sensibles.",
    match = ["awk '{print}' .env", "awk 1 .env.secret"],
    not_match = ["awk '{print}' .env.example", "awk 1 README.md"],
)

prefix_rule(
    pattern = [${starlarkStrings(CODEX_SEARCH_READERS)}, ${starlarkStrings(CODEX_SECRET_SEARCH_TERMS)}, ${starlarkStrings(CODEX_SECRET_ARGUMENTS)}],
    decision = "forbidden",
    justification = "No busques ni muestres contenido de archivos sensibles.",
    match = ["rg TOKEN .env", "grep PASSWORD .env.secret"],
    not_match = ["rg TOKEN .env.example", "grep TOKEN README.md"],
)

prefix_rule(
    pattern = [${starlarkStrings(CODEX_SEARCH_READERS)}, ${starlarkStrings(CODEX_SEARCH_FLAGS)}, ${starlarkStrings(CODEX_SECRET_SEARCH_TERMS)}, ${starlarkStrings(CODEX_SECRET_ARGUMENTS)}],
    decision = "forbidden",
    justification = "No busques ni muestres contenido de archivos sensibles.",
    match = ["rg -n TOKEN .env.secret", "grep --line-number PASSWORD .env"],
    not_match = ["rg -n TOKEN .env.example", "grep -n PASSWORD README.md"],
)

prefix_rule(
    pattern = [["env", "/usr/bin/env", "printenv", "/usr/bin/printenv"]],
    decision = "forbidden",
    justification = "El volcado del entorno puede exponer credenciales. Consulta solo configuracion no sensible por otro medio.",
    match = ["env", "printenv API_TOKEN"],
    not_match = ["command -v node"],
)

prefix_rule(
    pattern = ["export", "-p"],
    decision = "forbidden",
    justification = "El volcado del entorno puede exponer credenciales.",
    match = ["export -p"],
)

prefix_rule(
    pattern = ["git", "diff", "--", ${starlarkStrings(CODEX_SECRET_ARGUMENTS)}],
    decision = "forbidden",
    justification = "No muestres diffs de archivos sensibles.",
    match = ["git diff -- .env"],
    not_match = ["git diff -- .env.example"],
)

prefix_rule(
    pattern = ["git", "diff", ${starlarkStrings(CODEX_SECRET_ARGUMENTS)}],
    decision = "forbidden",
    justification = "No muestres diffs de archivos sensibles.",
    match = ["git diff .env"],
    not_match = ["git diff README.md"],
)

prefix_rule(
    pattern = ["git", "show", ${starlarkStrings(CODEX_GIT_OBJECT_ARGUMENTS)}],
    decision = "forbidden",
    justification = "No muestres versiones historicas de archivos sensibles.",
    match = ["git show HEAD:.env", "git show HEAD~1:.env.secret"],
    not_match = ["git show HEAD:.env.example", "git show HEAD:README.md"],
)
`
}

function commandSkill(command: SourceMarkdown, sharedRules: string): string {
  const description = frontmatterString(
    command.frontmatter,
    "description",
    `Ejecuta ${command.name}`,
  )
  const body = [
    "# Adaptacion Codex",
    "Ejecuta este workflow en la tarea padre. Cuando necesites especializacion, delega a los custom agents ms-* instalados. Usa $ARGUMENTS como entrada literal.",
    "# Reglas Compartidas MS",
    sharedRules.trim(),
    "# Workflow",
    command.body,
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
        content: codexAgent(agent, catalog.sharedRules),
      }),
    )
  }

  for (const skill of catalog.skills) {
    artifacts.push(...copySharedSkillArtifacts("codex", skill, roots.skills))
  }

  artifacts.push(
    textArtifact({
      target: "codex",
      kind: "policy",
      name: "ms-secrets",
      root: roots.codex,
      destination: path.join(roots.codex, "rules", "ms-secrets.rules"),
      content: codexSecretRules(),
    }),
  )

  const architect = catalog.agents.find((agent) => agent.name === "ms-architect")
  if (!architect) throw new Error("Falta el agente ms-architect en el catalogo")
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
        embeddedAgentBody(catalog.sharedRules, architect.body, CODEX_COMPATIBILITY),
      ),
    }),
  )

  for (const command of catalog.commands) {
    artifacts.push(
      textArtifact({
        target: "codex",
        kind: "command",
        name: command.name,
        root: roots.skills,
        destination: path.join(roots.skills, command.name, "SKILL.md"),
        content: commandSkill(command, catalog.sharedRules),
      }),
    )
  }

  return artifacts
}
