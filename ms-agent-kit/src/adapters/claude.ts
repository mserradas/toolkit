import path from "node:path"
import { agentDefinition } from "../core/agent-catalog.js"
import { frontmatterString, renderMarkdown } from "../core/frontmatter.js"
import { capabilityProfile } from "../core/profiles.js"
import { openCodeRolePermission } from "../core/opencode-role-permissions.js"
import type { Artifact, BuildContext, Catalog, SourceMarkdown } from "../core/types.js"
import {
  copySkillArtifacts,
  embeddedAgentBody,
  textArtifact,
} from "./common.js"

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
  if (!profile.asksQuestions) denied.add("AskUserQuestion")
  if (!profile.webFetch) denied.add("WebFetch")
  if (!profile.webSearch) denied.add("WebSearch")
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

function bashDenyRules(catalog: Catalog): Record<string, string[]> {
  return Object.fromEntries(
    catalog.agents.map((agent) => {
      const bash = openCodeRolePermission(agent.name).bash
      if (bash === "deny") return [agent.name, ["*"]]
      if (typeof bash !== "object" || bash === null || Array.isArray(bash)) {
        return [agent.name, []]
      }
      // En los mapas OpenCode, `*` es el fallback y los allow mas especificos lo
      // sustituyen. Para los roles cerrados ese fallback ya lo materializa la allowlist.
      const rules = Object.entries(bash)
        .filter(([pattern, action]) => pattern !== "*" && action === "deny")
        .map(([pattern]) => pattern)
      return [agent.name, rules]
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
  writeRules["workflow:ms-skills"] = [
    ".atl/skill-registry.md",
    ".atl/.skill-registry.cache.json",
    ".gitignore",
  ]
  const bashRules = readOnlyBashRules(catalog)
  const bashDeny = bashDenyRules(catalog)
  bashRules["workflow:ms-skills"] = []
  bashDeny["workflow:ms-skills"] = bashDeny["ms-codex"] ?? []
  return String.raw`#!/usr/bin/env node
import { realpathSync } from "node:fs"
import path from "node:path"

const WRITE_RULES = ${JSON.stringify(writeRules, null, 2)}
const READ_ONLY_BASH_RULES = ${JSON.stringify(bashRules, null, 2)}
const BASH_DENY_RULES = ${JSON.stringify(bashDeny, null, 2)}

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

function shellSequence(command) {
  const sequence = []
  let current = ""
  let quote = null
  let escaped = false
  const flush = (operator) => {
    if (current.trim()) sequence.push({ command: current.trim(), operator })
    current = ""
  }
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]
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
      continue
    }
    if (character === "|" && command[index + 1] !== "|") {
      const operator = command[index + 1] === "&" ? "|&" : "|"
      flush(operator)
      if (operator === "|&") index += 1
    } else if (";&\n\r".includes(character) || (character === "|" && command[index + 1] === "|")) {
      flush(character + (command[index + 1] === character ? character : ""))
      if (command[index + 1] === character) index += 1
    } else {
      current += character
    }
  }
  if (quote || escaped) return null
  flush(null)
  return sequence
}

function invocationStages(words) {
  let expandedWords = [...words]
  let index = expandedWords.findIndex((word) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word))
  if (index < 0) return []
  const stages = []
  while (index < expandedWords.length) {
    const executable = path.basename((expandedWords[index] || "").replaceAll("\\", "/"))
    stages.push({ executable, args: expandedWords.slice(index + 1) })
    if (executable === "command") {
      index += 1
      if (["-v", "-V"].includes(expandedWords[index])) return stages
      while (["--", "-p"].includes(expandedWords[index])) index += 1
      continue
    }
    if (executable === "builtin") {
      index += 1
      if (expandedWords[index] === "--") index += 1
      continue
    }
    if (executable === "exec") {
      index += 1
      while (index < expandedWords.length) {
        const argument = expandedWords[index]
        if (argument === "--") {
          index += 1
          break
        }
        if (argument === "-a") {
          index += 2
        } else if (argument.startsWith("--argv0=")) {
          index += 1
        } else if (["-c", "-l"].includes(argument)) {
          index += 1
        } else {
          break
        }
      }
      continue
    }
    if (executable === "sudo") {
      index += 1
      while (index < expandedWords.length) {
        const argument = expandedWords[index]
        if (argument === "--") {
          index += 1
          break
        }
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(argument)) {
          index += 1
        } else if (
          ["-u", "--user", "-g", "--group", "-h", "--host", "-p", "--prompt", "-C", "--close-from", "-T", "--command-timeout", "-R", "--chroot", "-D", "--chdir", "-r", "--role", "-t", "--type"].includes(argument)
        ) {
          index += 2
        } else if (/^--(?:user|group|host|prompt|close-from|command-timeout|chroot|chdir|role|type)=/.test(argument)) {
          index += 1
        } else if (/^-[AbEHKnPSVvils]+$/.test(argument) || ["--non-interactive", "--preserve-env"].includes(argument) || argument.startsWith("--preserve-env=")) {
          index += 1
        } else {
          break
        }
      }
      continue
    }
    if (executable === "env") {
      index += 1
      while (index < expandedWords.length) {
        const argument = expandedWords[index]
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(argument)) {
          index += 1
        } else if (["-u", "--unset", "-C", "--chdir", "-P"].includes(argument)) {
          if (!expandedWords[index + 1]) return null
          index += 2
        } else if (/^--(?:unset|chdir)=/.test(argument)) {
          index += 1
        } else if (["-S", "--split-string"].includes(argument)) {
          const split = expandedWords[index + 1]
          if (!split) return null
          const splitWords = shellWords(split)
          if (!splitWords || splitWords.length === 0) return null
          expandedWords.splice(index, 2, ...splitWords)
        } else if (argument.startsWith("--split-string=")) {
          const split = argument.slice("--split-string=".length)
          const splitWords = shellWords(split)
          if (!splitWords || splitWords.length === 0) return null
          expandedWords.splice(index, 1, ...splitWords)
        } else if (argument === "--" || argument === "-i" || argument === "--ignore-environment") {
          index += 1
        } else if (argument.startsWith("-")) {
          return null
        } else {
          break
        }
      }
      continue
    }
    return stages
  }
  return stages
}

function normalizedInvocation(words) {
  const stages = invocationStages(words)
  if (!stages) return null
  return stages[stages.length - 1] || null
}

function normalizedRemoveCandidate(args) {
  let recursive = false
  let forced = false
  const operands = []
  for (const argument of args) {
    if (argument === "--") continue
    if (argument === "--recursive") recursive = true
    else if (argument === "--force") forced = true
    else if (/^-[^-]/.test(argument)) {
      const options = argument.slice(1)
      if (options.includes("r") || options.includes("R")) recursive = true
      if (options.includes("f")) forced = true
    } else operands.push(argument)
  }
  const option = recursive && forced ? "-rf" : recursive ? "-r" : forced ? "-f" : ""
  return option ? ["rm", option, ...operands].join(" ") : null
}

function gitSubcommand(args) {
  const optionsWithValues = new Set([
    "-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env", "--exec-path",
  ])
  let index = 0
  while (index < args.length) {
    const argument = args[index]
    if (argument === "--") {
      index += 1
      break
    }
    if (optionsWithValues.has(argument)) {
      index += 2
    } else if ([...optionsWithValues].some((option) => argument.startsWith(option + "="))) {
      index += 1
    } else if (["--no-pager", "--paginate", "-P", "-p", "--bare"].includes(argument)) {
      index += 1
    } else {
      break
    }
  }
  return { name: args[index] || "", args: args.slice(index + 1) }
}

function invocationText(invocation) {
  return [invocation.executable, ...invocation.args].join(" ").trim()
}

function canonicalDenyCandidates(command) {
  const sequence = shellSequence(command)
  if (!sequence) return []
  const candidates = []
  const canonicalSequence = []
  for (const entry of sequence) {
    const words = shellWords(entry.command)
    if (!words) return []
    const variants = []
    const stages = invocationStages(words)
    if (!stages) return []
    for (const invocation of stages) {
      variants.push(invocationText(invocation))
      if (invocation.executable === "rm") {
        const normalizedRemove = normalizedRemoveCandidate(invocation.args)
        if (normalizedRemove) variants.push(normalizedRemove)
      }
      if (invocation.executable === "git") {
        const subcommand = gitSubcommand(invocation.args)
        if (subcommand.name) {
          variants.push(invocationText({ executable: "git", args: [subcommand.name, ...subcommand.args] }))
        }
      }
    }
    candidates.push(...variants)
    canonicalSequence.push(variants[variants.length - 1] || entry.command.trim())
  }
  candidates.push(
    canonicalSequence
      .map((entry, index) => entry + (sequence[index].operator ? " " + sequence[index].operator + " " : ""))
      .join("")
      .trim(),
  )
  return [...new Set(candidates.filter(Boolean))]
}

const MAX_SHELL_INSPECTION_DEPTH = 4
const COMMAND_SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"])
const UNSUPPORTED_EXECUTION_PREFIXES = new Set(["!", "time", "coproc"])

function parenthesizedCommand(command, openIndex) {
  let depth = 1
  let quote = null
  let escaped = false
  for (let index = openIndex + 1; index < command.length; index += 1) {
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
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
    } else if (character === "(") {
      depth += 1
    } else if (character === ")") {
      depth -= 1
      if (depth === 0) {
        return { body: command.slice(openIndex + 1, index), end: index }
      }
    }
  }
  return null
}

function backtickCommand(command, openIndex) {
  let escaped = false
  for (let index = openIndex + 1; index < command.length; index += 1) {
    const character = command[index]
    if (escaped) {
      // El significado de un backtick escapado depende del nivel de expansion.
      if (character.charCodeAt(0) === 96) return null
      escaped = false
      continue
    }
    if (character === "\\") {
      escaped = true
    } else if (character.charCodeAt(0) === 96) {
      return { body: command.slice(openIndex + 1, index), end: index }
    }
  }
  return null
}

function substitutionCommands(command) {
  const commands = []
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
    if (quote === "'") {
      if (character === quote) quote = null
      continue
    }
    if (character === "'" && quote === null) {
      quote = character
      continue
    }
    if (character === '"') {
      if (quote === '"') quote = null
      else if (quote === null) quote = '"'
      continue
    }
    const isDollarSubstitution = character === "$" && command[index + 1] === "("
    const isProcessSubstitution =
      (character === "<" || character === ">") && command[index + 1] === "("
    if (isDollarSubstitution || isProcessSubstitution) {
      // La expansion aritmetica no es codigo shell directamente, pero mezclarla
      // con sustituciones requiere un parser completo: se cierra conservadoramente.
      if (isDollarSubstitution && command[index + 2] === "(") return null
      const parsed = parenthesizedCommand(command, index + 1)
      if (!parsed) return null
      commands.push(parsed.body)
      index = parsed.end
    } else if (character.charCodeAt(0) === 96) {
      const parsed = backtickCommand(command, index)
      if (!parsed) return null
      commands.push(parsed.body)
      index = parsed.end
    } else if (character === "(" && quote === null) {
      const parsed = parenthesizedCommand(command, index)
      if (!parsed) return null
      commands.push(parsed.body)
      index = parsed.end
    } else if (character === ")" && quote === null) {
      return null
    }
  }
  if (quote || escaped) return null
  return commands
}

function envSplitCommands(args) {
  const commands = []
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(argument)) continue
    if (["-u", "--unset", "-C", "--chdir", "-P"].includes(argument)) {
      if (!args[index + 1]) return null
      index += 1
      continue
    }
    if (/^--(?:unset|chdir)=/.test(argument) || ["-i", "--ignore-environment"].includes(argument)) {
      continue
    }
    if (["-S", "--split-string"].includes(argument)) {
      if (!args[index + 1]) return null
      const trailing = args.slice(index + 2)
      if (trailing.some((word) => !/^[A-Za-z0-9_@%+=:,./-]+$/.test(word))) return null
      commands.push([args[index + 1], ...trailing].join(" "))
      return commands
    }
    if (argument.startsWith("--split-string=")) {
      const split = argument.slice("--split-string=".length)
      if (!split) return null
      const trailing = args.slice(index + 1)
      if (trailing.some((word) => !/^[A-Za-z0-9_@%+=:,./-]+$/.test(word))) return null
      commands.push([split, ...trailing].join(" "))
      return commands
    }
    if (argument === "--") continue
    if (argument.startsWith("-")) return null
    break
  }
  return commands
}

const XARGS_SAFE_OPTIONS = new Set([
  "-0", "--null", "-r", "--no-run-if-empty",
])

function isStaticXargsConsumer(words) {
  if (words.length < 2) return false
  const executable = path.basename((words[0] || "").replaceAll("\\", "/"))
  if (executable !== "printf") return false
  const args = words.slice(1)
  if (args[0] === "--") args.shift()
  const format = args[0]
  return (
    typeof format === "string" &&
    !format.startsWith("-") &&
    !hasUnresolvedParameterExpansion(format) &&
    !hasActiveCodeGeneration(format)
  )
}

function xargsCommand(args) {
  let index = 0
  while (index < args.length) {
    const argument = args[index]
    if (argument === "--") {
      index += 1
      break
    }
    if (XARGS_SAFE_OPTIONS.has(argument)) {
      index += 1
      continue
    }
    if (argument.startsWith("-")) return null
    break
  }
  if (index >= args.length) return null
  const command = args.slice(index)
  return isStaticXargsConsumer(command) ? command : null
}

function shellLiteral(word) {
  return "'" + String(word).replaceAll("'", "'\\''") + "'"
}

const SHELL_OPTIONS_WITH_VALUES = new Set([
  "-o", "+o", "-O", "+O", "--rcfile", "--init-file", "--startup-file",
])
const SHELL_OPTIONS_WITHOUT_VALUES = new Set([
  "--debugger", "--dump-po-strings", "--dump-strings", "--emacs", "--globalrcs",
  "--help", "--interactive", "--login", "--noediting", "--noemacs", "--noglobalrcs",
  "--noprofile", "--norc", "--norcs", "--posix", "--pretty-print", "--privileged",
  "--rcs", "--restricted", "--shinstdin", "--singlecommand", "--verbose", "--version",
  "--xtrace",
])

function shellCommand(args) {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "-c") {
      if (!args[index + 1]) return null
      return args[index + 1]
    }
    if (argument === "--") return ""
    if (SHELL_OPTIONS_WITH_VALUES.has(argument)) {
      if (!args[index + 1]) return null
      index += 1
      continue
    }
    if (["--rcfile=", "--init-file=", "--startup-file="].some((prefix) => argument.startsWith(prefix))) {
      if (argument.endsWith("=")) return null
      continue
    }
    if (SHELL_OPTIONS_WITHOUT_VALUES.has(argument)) continue
    if (/^[-+][^-]+$/.test(argument)) {
      if (argument.slice(1).includes("c")) return null
      continue
    }
    if (args.slice(index + 1).includes("-c")) return null
    return ""
  }
  return ""
}

function invocationCommands(command) {
  const sequence = shellSequence(command)
  if (!sequence) return null
  const commands = []
  for (const entry of sequence) {
    const words = shellWords(entry.command)
    if (!words) return null
    const stages = invocationStages(words)
    if (!stages) return null
    for (const invocation of stages) {
      if (invocation.executable === "env") {
        const splitCommands = envSplitCommands(invocation.args)
        if (!splitCommands) return null
        commands.push(...splitCommands.map((inner) => ({ command: inner, interpreted: true })))
      }
      if (invocation.executable === "xargs") {
        const words = xargsCommand(invocation.args)
        if (!words) return null
        commands.push({ command: words.map(shellLiteral).join(" "), interpreted: false })
      }
    }
    const invocation = stages[stages.length - 1]
    if (!invocation || !COMMAND_SHELLS.has(invocation.executable)) continue
    const nestedCommand = shellCommand(invocation.args)
    if (nestedCommand === null) return null
    if (nestedCommand) commands.push({ command: nestedCommand, interpreted: true })
  }
  return commands
}

function hasActiveCodeGeneration(command) {
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
    if (quote === "'") {
      if (character === quote) quote = null
      continue
    }
    if (character === "'" && quote === null) {
      quote = "'"
      continue
    }
    if (character === '"') {
      quote = quote === '"' ? null : '"'
      continue
    }
    if (character.charCodeAt(0) === 96) return true
    if (character === "$" && command[index + 1] === "(") return true
    if ((character === "<" || character === ">") && command[index + 1] === "(") return true
  }
  return false
}

function hasUnresolvedParameterExpansion(command) {
  let escaped = false
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === "\\") {
      escaped = true
      continue
    }
    if (character !== "$") continue
    const next = command[index + 1] || ""
    if (next === "(") continue
    if (next === "{" || /[A-Za-z0-9_@*#?$!\-]/.test(next)) return true
  }
  return false
}

const UNSUPPORTED_SHELL_CONTROL_WORDS = new Set([
  "if", "then", "elif", "else", "fi",
  "for", "while", "until", "select", "in", "do", "done",
  "case", "esac", "{", "}",
])

function hasUnsupportedShellControl(command) {
  const sequence = shellSequence(command)
  if (!sequence) return true
  return sequence.some((entry) => {
    const words = shellWords(entry.command)
    if (!words) return true
    const first = words.find((word) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) || ""
    return UNSUPPORTED_SHELL_CONTROL_WORDS.has(first)
  })
}

function hasUnsupportedExecutionPrefix(command) {
  const sequence = shellSequence(command)
  if (!sequence) return true
  return sequence.some((entry) => {
    const words = shellWords(entry.command)
    if (!words) return true
    const stages = invocationStages(words)
    if (!stages) return true
    return stages.some((stage) => UNSUPPORTED_EXECUTION_PREFIXES.has(stage.executable))
  })
}

function matchesDenyRule(agent, command) {
  const segments = shellSegments(command)
  const sequence = shellSequence(command)
  if (!segments || !sequence) return null
  const candidates = [command.trim(), ...segments, ...canonicalDenyCandidates(command)]
  const denyRules = BASH_DENY_RULES[agent] || []
  return denyRules.some((pattern) =>
    candidates.some((candidate) => commandPatternRegex(pattern).test(candidate)),
  )
}

function passesRecursiveDenyRules(agent, command, depth = 0) {
  if (depth > MAX_SHELL_INSPECTION_DEPTH) return false
  if (
    invokesEnvironmentDump(command) ||
    hasUnsupportedShellControl(command) ||
    hasUnsupportedExecutionPrefix(command)
  ) return false
  const denied = matchesDenyRule(agent, command)
  if (denied === null || denied) return false
  const substitutions = substitutionCommands(command)
  const invocations = invocationCommands(command)
  if (!substitutions || !invocations) return false
  if (
    invocations.some(
      (invocation) =>
        invocation.interpreted &&
        (hasUnresolvedParameterExpansion(invocation.command) ||
          hasActiveCodeGeneration(invocation.command)),
    )
  ) return false
  return [...substitutions, ...invocations.map((invocation) => invocation.command)].every(
    (inner) => passesRecursiveDenyRules(agent, inner, depth + 1),
  )
}

function invokesEnvironmentDump(command) {
  const sequence = shellSequence(command)
  if (!sequence) return true
  return sequence.some((entry) => {
    const words = shellWords(entry.command)
    if (!words) return true
    const stages = invocationStages(words)
    if (!stages) return true
    if (stages.some((stage) => stage.executable === "printenv")) return true
    return stages.some(
      (stage, index) => stage.executable === "env" && index === stages.length - 1,
    )
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
  if (!passesRecursiveDenyRules(agent, command)) return false
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
  if (tool === "Grep" && toolInput.glob) pathValues.push(toolInput.glob)
  if (pathValues.some(secretPath)) {
    console.error("Bloqueado por la política ms-*: acceso a una ruta sensible")
    process.exit(2)
  }

  if (tool === "Bash") {
    const command = String(toolInput.command || "")
    const commandWords = command
      .split(/[\s;&|<>()]+/)
      .map((value) => value.replace(/^["']+|["']+$/g, ""))
      .filter(Boolean)
    if (invokesEnvironmentDump(command) || commandWords.some(secretPath)) {
      console.error("Bloqueado por la política ms-*: comando con secretos o variables de entorno")
      process.exit(2)
    }
    if (!allowedReadOnlyCommand(process.argv[2], command)) {
      console.error("Bloqueado por la política ms-*: comando denegado para este agente")
      process.exit(2)
    }
  }

  if (["Write", "Edit", "NotebookEdit"].includes(tool)) {
    const destination = toolInput.file_path || toolInput.notebook_path || toolInput.path
    if (!allowedWrite(process.argv[2], destination)) {
      console.error("Bloqueado por la política ms-*: escritura fuera del alcance del agente")
      process.exit(2)
    }
  }
} catch (error) {
  console.error("Bloqueado por la política ms-*: entrada de hook invalida")
  process.exit(2)
}
`
}

function claudeCommand(
  command: SourceMarkdown,
  agents: SourceMarkdown[],
  sharedRules: string,
  guardPath: string,
): string {
  const description = frontmatterString(
    command.frontmatter,
    "description",
    `Ejecuta ${command.name}`,
  )
  const requestedAgent = frontmatterString(command.frontmatter, "agent", "ms-architect")
  const agent = agents.find((candidate) => candidate.name === requestedAgent)
  if (!agent) throw new Error(`El workflow ${command.name} referencia el agente inexistente ${requestedAgent}`)
  const guardScope = command.name === "ms-skills" ? "workflow:ms-skills" : agent.name
  const frontmatter: Record<string, unknown> = {
    name: command.name,
    description,
    "disable-model-invocation": true,
    context: "fork",
    agent: agent.name,
    hooks: claudeGuardHooks(guardPath, guardScope),
  }
  return renderMarkdown(
    frontmatter,
    [
      "# Adaptacion Claude Code",
      `Ejecuta este workflow con el rol de ${agent.name}. Usa $ARGUMENTS como entrada literal.`,
      embeddedAgentBody(sharedRules, agent.body, CLAUDE_COMPATIBILITY),
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
        content: claudeCommand(command, catalog.agents, catalog.sharedRules, guardPath),
      }),
    )
  }

  return artifacts
}
