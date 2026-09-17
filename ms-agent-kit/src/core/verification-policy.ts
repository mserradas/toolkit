import { lstatSync, realpathSync } from "node:fs"
import path from "node:path"
import { AppError } from "./errors.js"
import { isSensitivePath } from "./permissions.js"
import type { BuildContext } from "./types.js"
const DEFAULT_VERIFICATION_OUTPUTS = ["coverage", "test-results", "playwright-report", ".pytest_cache", ".ruff_cache", ".mypy_cache", "node_modules/.cache", "node_modules/.vite"] as const

export interface ProjectVerification { root: string; commands: string[]; outputPaths: string[] }
export interface VerificationConfiguration { projects: ProjectVerification[] }
export interface VerificationGrant { commands: string[]; outputPaths: string[] }
export const VERIFICATION_ROLES = ["ms-codex", "ms-fastlane", "ms-tester"] as const

function invalid(reason: string): never {
  throw new AppError("STATE_INVALID", `Autorización de verificación inválida: ${reason}`, 4)
}

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) invalid("objeto o campos no admitidos")
  return value as Record<string, unknown>
}

const verificationName = "(?:tests?|lint|typecheck|check|build|validate|verify|ci|quality)(?:[:_-][A-Za-z0-9_-]+)*"
const scriptCommand = new RegExp(`^(?:(?:pnpm|yarn|bun)(?: run)?|npm run) ${verificationName}$`)
const makeCommand = new RegExp(`^make ${verificationName}$`)
const localCommand = new RegExp(`^\\./scripts/${verificationName}\\.(?:sh|mjs|js|py)$`)
const composeCommand = /^docker compose -f (?:[A-Za-z0-9_-]+\/)*(?:(?:docker-)?compose[._-]test(?:s)?|test[._-]compose)\.ya?ml run --rm (?:tests?|test[-_][a-z0-9_-]+|(?:unit|integration)[-_]tests?)$/

function validCommand(command: string): boolean {
  if (command.length > 512 || !/^[A-Za-z0-9_.:/ -]+$/.test(command)) return false
  if (command.split(" ").some((word) => word.split("/").includes("..") || isSensitivePath(word))) return false
  if (/(?:^|[^A-Za-z0-9])(?:prod|production|privileged|socket|install|add|remove|deploy|publish|push|fix|write|update|upgrade|downgrade|migrate|seed|destroy|delete|clean|reset|exec|ssh|curl|wget)(?:$|[^A-Za-z0-9])/.test(command)) return false
  return command === "npm test" || scriptCommand.test(command) || makeCommand.test(command) || localCommand.test(command) || composeCommand.test(command)
}

function validOutput(directory: string): boolean {
  if (directory.length > 256 || path.isAbsolute(directory) || !/^[A-Za-z0-9_.\/-]+$/.test(directory) || isSensitivePath(directory)) return false
  const parts = directory.split("/")
  if (parts.some((part) => !part || part === "." || part === "..")) return false
  const cache = ["node_modules/.cache", "node_modules/.vite"].includes(parts.slice(-2).join("/"))
  const prefix = parts.slice(0, cache ? -2 : -1)
  if (prefix.some((part) => !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(part) || ["src", "config", "configs", "node_modules", "secrets"].includes(part))) return false
  return cache || ["coverage", "test-results", "playwright-report", ".pytest_cache", ".ruff_cache", ".mypy_cache"].includes(parts.at(-1)!)
}

function strings(value: unknown, max: number, check: (entry: string) => boolean, field: string): string[] {
  if (!Array.isArray(value) || value.length > max || value.some((entry) => typeof entry !== "string" || !check(entry)) || new Set(value).size !== value.length) invalid(`${field}: valores, duplicados o límite no admitidos`)
  return [...value] as string[]
}

export function validateVerificationConfiguration(value: unknown): VerificationConfiguration {
  const configuration = object(value, ["projects"])
  if (!Array.isArray(configuration.projects) || configuration.projects.length > 32) invalid("projects debe contener hasta 32 proyectos")
  const roots = new Set<string>()
  const projects = configuration.projects.map((entry) => {
    const candidate = object(entry, ["root", "commands", "outputPaths"])
    if (typeof candidate.root !== "string" || candidate.root.length > 1024 || !path.isAbsolute(candidate.root) || /[\x00-\x1f\x7f\\*?\[\]{}]/.test(candidate.root) || candidate.root.split("/").some((part) => part === "." || part === "..") || isSensitivePath(candidate.root)) invalid("root debe ser una ruta absoluta de proyecto sin ambigüedad")
    const root = path.normalize(candidate.root as string).replace(/\/$/, "")
    if (!root || roots.has(root)) invalid("raíz vacía o duplicada")
    roots.add(root)
    const commands = strings(candidate.commands, 32, validCommand, "commands")
    const outputPaths = strings(candidate.outputPaths, 16, validOutput, "outputPaths")
    if (!commands.length && outputPaths.length) invalid("outputPaths requiere comandos revisados")
    return { root, commands, outputPaths }
  })
  return { projects }
}

/** Checks every existing component; missing outputs are allowed, symlinks are not. */
function checkProjectPath(root: string, relative: string, directory = false): void {
  let current = root
  const parts = relative.replace(/^\.\//, "").split("/")
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part)
    try {
      const info = lstatSync(current)
      if (info.isSymbolicLink() || realpathSync(current) !== current) invalid("symlink o ruta ambigua dentro del proyecto")
      if ((directory || index < parts.length - 1) ? !info.isDirectory() : !info.isFile()) invalid("tipo de ruta no admitido")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return
      throw error
    }
  }
}

/** Personal configuration only; metadata in project.yaml never grants access. */
export function getProjectVerification(context: BuildContext): VerificationGrant {
  const empty = { commands: [], outputPaths: [] }
  if (context.scope !== "project" || !context.kitConfiguration?.verification) return empty
  const configured = validateVerificationConfiguration(context.kitConfiguration.verification)
  const projectRoot = path.resolve(context.projectRoot)
  const project = configured.projects.find(({ root }) => root === projectRoot)
  if (!project) return empty
  try {
    if (!lstatSync(projectRoot).isDirectory() || realpathSync(projectRoot) !== projectRoot) invalid("root inexistente, symlink o no canónica")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") invalid("root inexistente")
    throw error
  }
  for (const output of project.outputPaths) checkProjectPath(projectRoot, output, true)
  for (const command of project.commands) {
    for (const word of command.split(" ")) {
      if (word.startsWith("./") || /\.ya?ml$/.test(word)) checkProjectPath(projectRoot, word)
    }
    if (command.startsWith("make ")) for (const file of ["Makefile", "makefile", "GNUmakefile"]) checkProjectPath(projectRoot, file)
    if (/^(?:npm|pnpm|yarn|bun) /.test(command)) checkProjectPath(projectRoot, "package.json")
  }
  return { commands: [...project.commands], outputPaths: [...project.outputPaths] }
}

export function verificationForRole(agentName: string, context: BuildContext): VerificationGrant {
  return (VERIFICATION_ROLES as readonly string[]).includes(agentName) ? getProjectVerification(context) : { commands: [], outputPaths: [] }
}

export function verificationOutputPaths(agentName: string, context: BuildContext): string[] {
  if (!(VERIFICATION_ROLES as readonly string[]).includes(agentName)) return []
  return [...new Set([...DEFAULT_VERIFICATION_OUTPUTS, ...verificationForRole(agentName, context).outputPaths])]
}
