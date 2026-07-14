import path from "node:path"
import { agentDefinition } from "../core/agent-catalog.js"
import { frontmatterString, renderMarkdown } from "../core/frontmatter.js"
import { capabilityProfile } from "../core/profiles.js"
import { openCodeRolePermission } from "../core/opencode-role-permissions.js"
import type { Artifact, BuildContext, Catalog, SourceMarkdown } from "../core/types.js"
import { copySkillArtifacts, embeddedAgentBody, textArtifact } from "./common.js"

const CLAUDE_COMPATIBILITY = `
- Interpreta task como la herramienta Agent de Claude Code.
- Interpreta question como AskUserQuestion cuando este disponible; si eres un subagente, devuelve la pregunta bloqueante al padre.
- Las reglas compartidas y el contrato de salida llegan precargados mediante la skill ms-shared.
- Los nombres de permisos de OpenCode dentro del cuerpo describen limites de rol. El frontmatter de Claude Code es la autoridad de herramientas.
- Solo ms-architect coordina otros agentes. El resto ejecuta su alcance y devuelve un resumen verificable.
`

function rootFor(context: BuildContext): string {
  return context.scope === "user"
    ? path.join(context.homeDir, ".claude")
    : path.join(context.projectRoot, ".claude")
}

function deniedTools(name: string): string[] {
  const profile = capabilityProfile(agentDefinition(name).capabilityProfile)
  const denied = new Set<string>()
  if (!profile.writes) {
    denied.add("Write")
    denied.add("Edit")
    denied.add("NotebookEdit")
  }
  if (!profile.shell) denied.add("Bash")
  if (!profile.orchestrates) denied.add("Agent")
  if (!profile.usesSkills) denied.add("Skill")
  if (!profile.web) {
    denied.add("WebFetch")
    denied.add("WebSearch")
  }
  return [...denied]
}

function claudeGuardHooks(guardPath: string, agentName: string): Record<string, unknown> {
  return {
    PreToolUse: [
      {
        matcher: "Read|Bash|Grep|Glob|Write|Edit|NotebookEdit",
        hooks: [
          {
            type: "command",
            command: `node ${JSON.stringify(guardPath)} ${JSON.stringify(agentName)}`,
          },
        ],
      },
    ],
  }
}

function claudeAgent(agent: SourceMarkdown, guardPath: string): string {
  const description = frontmatterString(
    agent.frontmatter,
    "description",
    `Agente especializado ${agent.name}`,
  )
  const frontmatter: Record<string, unknown> = {
    name: agent.name,
    description,
    model: "inherit",
    permissionMode: "default",
    skills: ["ms-shared"],
    hooks: claudeGuardHooks(guardPath, agent.name),
  }
  const denied = deniedTools(agent.name)
  if (denied.length > 0) frontmatter.disallowedTools = denied

  return renderMarkdown(
    frontmatter,
    `# Compatibilidad Claude Code\n\n${CLAUDE_COMPATIBILITY.trim()}\n\n${agent.body}`,
  )
}

function readOnlyBashRules(catalog: Catalog): Record<string, string[]> {
  return Object.fromEntries(
    catalog.agents.flatMap((agent) => {
      const profile = capabilityProfile(agentDefinition(agent.name).capabilityProfile)
      if (profile.writes || !profile.shell) return []
      const bash = openCodeRolePermission(agent.name).bash
      if (typeof bash !== "object" || bash === null || Array.isArray(bash)) return []
      const rules = Object.entries(bash)
        .filter(
          ([pattern, action]) =>
            pattern !== "*" && action === "allow" && !pattern.startsWith("opencode "),
        )
        .map(([pattern]) => pattern)
      return [[agent.name, rules]]
    }),
  )
}

function claudeGuardSource(catalog: Catalog): string {
  const writeRules = Object.fromEntries(
    catalog.agents.map((agent) => [
      agent.name,
      capabilityProfile(agentDefinition(agent.name).capabilityProfile).writePaths,
    ]),
  )
  const bashRules = readOnlyBashRules(catalog)
  return String.raw`#!/usr/bin/env node
import { realpathSync } from "node:fs"
import path from "node:path"

const WRITE_RULES = ${JSON.stringify(writeRules, null, 2)}
const READ_ONLY_BASH_RULES = ${JSON.stringify(bashRules, null, 2)}

function secretPath(value) {
  const normalized = String(value || "").replaceAll("\\", "/")
  const segments = normalized.split("/")
  const envFile = segments.some((segment) => {
    if (segment === ".env.example") return false
    if (!segment.startsWith(".env")) return false
    const suffix = segment.slice(4, 5)
    return suffix === "" || ".*?[".includes(suffix)
  })
  const sensitiveGlob = segments.some(
    (segment) =>
      ["*", "?", "["].some((character) => segment.includes(character)) &&
      (segment.startsWith(".") || segment.toLowerCase().includes("env")),
  )
  return (
    envFile || sensitiveGlob ||
    /(^|\/)(?:secrets|\.ssh|\.credentials)(?:\/|$)/.test(normalized) ||
    /(^|\/)\.aws\/credentials$/.test(normalized) ||
    /(^|\/)\.config\/gh\/hosts\.yml$/.test(normalized) ||
    /(^|\/)\.docker\/config\.json$/.test(normalized) ||
    /(^|\/)\.kube\/config$/.test(normalized) ||
    /(^|\/)(?:\.netrc|\.npmrc|\.pypirc|credentials\.json)$/.test(normalized) ||
    /(^|\/)Library\/Keychains(?:\/|$)/.test(normalized) ||
    /\.(?:key|pem|p12|pfx)$/.test(normalized)
  )
}

function globRegex(pattern) {
  let output = "^"
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]
    if (character === "*" && pattern[index + 1] === "*") {
      output += ".*"
      index += 1
    } else if (character === "*") {
      output += "[^/]*"
    } else if (character === "?") {
      output += "[^/]"
    } else {
      output += character.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")
    }
  }
  return new RegExp(output + "$")
}

function commandPatternRegex(pattern) {
  let output = "^"
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]
    if (character === "*") {
      output += ".*"
    } else if (/\s/.test(character)) {
      output += "\\s+"
      while (/\s/.test(pattern[index + 1] || "")) index += 1
    } else {
      output += character.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")
    }
  }
  return new RegExp(output + "$")
}

function shellWords(command) {
  const words = []
  let current = ""
  let quote = null
  let escaped = false
  const flush = () => {
    if (current) words.push(current)
    current = ""
  }
  for (const character of command) {
    if (escaped) {
      current += character
      escaped = false
      continue
    }
    if (character === "\\" && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (character === quote) quote = null
      else current += character
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
    } else if (/\s/.test(character) || ";|&<>()".includes(character)) {
      flush()
    } else {
      current += character
    }
  }
  if (quote || escaped) return null
  flush()
  return words
}

function shellSegments(command) {
  const segments = []
  let current = ""
  let quote = null
  let escaped = false
  const flush = () => {
    if (current.trim()) segments.push(current.trim())
    current = ""
  }
  for (const character of command) {
    if (escaped) {
      current += character
      escaped = false
      continue
    }
    if (character === "\\" && quote !== "'") {
      current += character
      escaped = true
      continue
    }
    if (quote) {
      current += character
      if (character === quote) quote = null
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      current += character
    } else if (";|&\n\r".includes(character)) {
      flush()
    } else {
      current += character
    }
  }
  if (quote || escaped) return null
  flush()
  return segments
}

function invokesEnvironmentDump(command) {
  const segments = shellSegments(command)
  if (!segments) return true
  return segments.some((segment) => {
    const words = shellWords(segment)
    if (!words) return true
    let index = words.findIndex((word) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word))
    if (index < 0) return false
    let executable = path.basename(words[index].replaceAll("\\", "/"))
    if (["command", "builtin", "exec"].includes(executable)) {
      index += 1
      executable = path.basename((words[index] || "").replaceAll("\\", "/"))
    } else if (executable === "sudo") {
      return words.slice(index + 1).some((word) =>
        ["env", "printenv"].includes(path.basename(word.replaceAll("\\", "/"))),
      )
    }
    return ["env", "printenv"].includes(executable)
  })
}

function unsafeShellSyntax(command) {
  let quote = null
  let escaped = false
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === "\\" && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (character === quote) quote = null
      else if (quote !== "'" && (character === "$" || character.charCodeAt(0) === 96)) return true
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
    } else if (";|&<>()\n\r".includes(character) || character === "$" || character.charCodeAt(0) === 96) {
      return true
    }
  }
  return Boolean(quote || escaped)
}

function unsafeReadOnlyArguments(words) {
  const executableIndex = words.findIndex(
    (word) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word),
  )
  if (executableIndex < 0) return true
  const executable = path.basename(words[executableIndex].replaceAll("\\", "/"))
  const args = words.slice(executableIndex + 1)
  const mutatingArguments = [
    "--fix",
    "--write",
    "--update",
    "--update-snapshot",
    "--update-snapshots",
    "--updateSnapshot",
    "-u",
    "--output",
    "--output-file",
    "--report-path",
    "--sarif-output",
    "--json-output",
  ]
  if (
    args.some((argument) =>
      mutatingArguments.some(
        (blocked) => argument === blocked || argument.startsWith(blocked + "="),
      ),
    )
  ) return true
  if (executable === "git" && args[0] === "branch") {
    const form = args.slice(1).join(" ")
    return !["", "--show-current", "--list", "-a", "-r", "-v", "-vv"].includes(form)
  }
  if (executable === "find") {
    return args.some((argument) =>
      ["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprintf", "-fprint", "-fls"].includes(argument),
    )
  }
  if (executable === "curl") {
    return args.some((argument) =>
      argument === "-O" ||
      argument.startsWith("-o") ||
      ["--output", "--remote-name", "--output-dir", "--create-dirs"].includes(argument),
    )
  }
  return false
}

function allowedReadOnlyCommand(agent, command) {
  const rules = READ_ONLY_BASH_RULES[agent]
  if (!rules) return true
  if (unsafeShellSyntax(command)) return false
  const words = shellWords(command)
  if (!words || words.length === 0 || unsafeReadOnlyArguments(words)) return false
  return rules.some((pattern) => commandPatternRegex(pattern).test(command.trim()))
}

function canonicalPath(value) {
  let candidate = path.resolve(String(value || ""))
  const suffix = []
  while (true) {
    try {
      return path.join(realpathSync.native(candidate), ...suffix)
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
      const parent = path.dirname(candidate)
      if (parent === candidate) return path.resolve(String(value || ""))
      suffix.unshift(path.basename(candidate))
      candidate = parent
    }
  }
}

function allowedWrite(agent, value) {
  const absolute = canonicalPath(value)
  const relative = path.relative(canonicalPath(process.cwd()), absolute).replaceAll("\\", "/")
  if (!relative || relative === "." || relative === ".." || relative.startsWith("../")) return false
  return (WRITE_RULES[agent] || []).some((pattern) => pattern === "**" || globRegex(pattern).test(relative))
}

let input = ""
for await (const chunk of process.stdin) input += chunk

try {
  const payload = JSON.parse(input || "{}")
  const tool = payload.tool_name || ""
  const toolInput = payload.tool_input || {}
  const pathValues = [toolInput.file_path, toolInput.path, toolInput.notebook_path].filter(Boolean)

  if (tool === "Glob" && toolInput.pattern) pathValues.push(toolInput.pattern)
  if (pathValues.some(secretPath)) {
    console.error("Bloqueado por ms-agent-kit: acceso a una ruta sensible")
    process.exit(2)
  }

  if (tool === "Bash") {
    const command = String(toolInput.command || "")
    const commandWords = command
      .split(/[\s;&|<>()]+/)
      .map((value) => value.replace(/^["']+|["']+$/g, ""))
      .filter(Boolean)
    if (invokesEnvironmentDump(command) || commandWords.some(secretPath)) {
      console.error("Bloqueado por ms-agent-kit: comando con secretos o variables de entorno")
      process.exit(2)
    }
    if (!allowedReadOnlyCommand(process.argv[2], command)) {
      console.error("Bloqueado por ms-agent-kit: comando fuera de la allowlist de solo lectura")
      process.exit(2)
    }
  }

  if (["Write", "Edit", "NotebookEdit"].includes(tool)) {
    const destination = toolInput.file_path || toolInput.notebook_path || toolInput.path
    if (!allowedWrite(process.argv[2], destination)) {
      console.error("Bloqueado por ms-agent-kit: escritura fuera del alcance del agente")
      process.exit(2)
    }
  }
} catch (error) {
  console.error("Bloqueado por ms-agent-kit: entrada de hook invalida")
  process.exit(2)
}
`
}

function claudeCommand(
  command: SourceMarkdown,
  architect: SourceMarkdown,
  sharedRules: string,
  guardPath: string,
): string {
  const description = frontmatterString(
    command.frontmatter,
    "description",
    `Ejecuta ${command.name}`,
  )
  return renderMarkdown(
    {
      name: command.name,
      description,
      "disable-model-invocation": true,
      hooks: claudeGuardHooks(guardPath, architect.name),
    },
    [
      "# Adaptacion Claude Code",
      "Ejecuta este workflow en la conversacion principal con el rol de ms-architect. Puedes delegar directamente a los custom agents ms-* mediante Agent. Usa $ARGUMENTS como entrada literal.",
      embeddedAgentBody(sharedRules, architect.body, CLAUDE_COMPATIBILITY),
      "# Workflow",
      command.body,
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
  const guardPath = path.join(root, "hooks", "ms-agent-guard.mjs")
  const artifacts: Artifact[] = []
  const architect = catalog.agents.find((agent) => agent.name === "ms-architect")
  if (!architect) throw new Error("Falta el agente ms-architect en el catalogo")

  artifacts.push(
    textArtifact({
      target: "claude",
      kind: "policy",
      name: "ms-agent-guard",
      root,
      destination: guardPath,
      content: claudeGuardSource(catalog),
    }),
  )

  for (const agent of catalog.agents) {
    artifacts.push(
      textArtifact({
        target: "claude",
        kind: "agent",
        name: agent.name,
        root,
        destination: path.join(root, "agents", agent.fileName),
        content: claudeAgent(agent, guardPath),
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
      content: sharedSkill(catalog.sharedRules),
    }),
  )

  for (const command of catalog.commands) {
    artifacts.push(
      textArtifact({
        target: "claude",
        kind: "command",
        name: command.name,
        root,
        destination: path.join(skillsRoot, command.name, "SKILL.md"),
        content: claudeCommand(command, architect, catalog.sharedRules, guardPath),
      }),
    )
  }

  return artifacts
}
