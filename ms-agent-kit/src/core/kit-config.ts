import { constants } from "node:fs"
import { lstat, open } from "node:fs/promises"
import path from "node:path"
import YAML from "yaml"
import { AppError } from "./errors.js"
import { AGENT_DEFINITIONS, type AgentName } from "./agent-catalog.js"
import type { ReasoningEffort } from "./agent-models.js"
import { assertNoEmbeddedSecrets } from "./security.js"
import { TARGETS, type Target } from "./types.js"
import { validateVerificationConfiguration, type VerificationConfiguration } from "./verification-policy.js"

export interface ModelOverride { model?: string; reasoningEffort?: ReasoningEffort }
export interface KitConfiguration {
  schemaVersion: 1
  models: Partial<Record<AgentName, Partial<Record<Target, ModelOverride>>>>
  verification?: VerificationConfiguration
}

function invalid(message: string): never {
  throw new AppError("STATE_INVALID", `Configuración personal inválida: ${message}`, 4)
}

function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("se esperaba un objeto")
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid("campo desconocido")
  return value as Record<string, unknown>
}

export function validateKitConfiguration(value: unknown): KitConfiguration {
  const root = object(value, ["schemaVersion", "models", "verification"])
  if (root.schemaVersion !== 1) invalid("schemaVersion no soportada")
  if (root.models && typeof root.models === "object" && Object.keys(root.models).some((key) => ["strong", "balanced", "light", "fast"].includes(key))) {
    invalid("models ya no admite perfiles strong/balanced/light/fast; usa nombres de agentes ms-* como ms-codex")
  }
  const models = object(root.models, Object.keys(AGENT_DEFINITIONS))
  const result: KitConfiguration = { schemaVersion: 1, models: {} }
  for (const [agent, clients] of Object.entries(models)) {
    const validatedClients: Partial<Record<Target, ModelOverride>> = {}
    for (const [client, candidate] of Object.entries(object(clients, [...TARGETS]))) {
      const override = object(candidate, ["model", "reasoningEffort"])
      const validated: ModelOverride = {}
      if ("model" in override) {
        if (typeof override.model !== "string" || !override.model.trim() || override.model.length > 256 || /[\x00-\x20\x7f]/.test(override.model)) invalid("model debe ser un identificador sin espacios ni controles")
        assertNoEmbeddedSecrets(override.model, "model")
        validated.model = override.model
      }
      if ("reasoningEffort" in override) {
        if (typeof override.reasoningEffort !== "string" || !["low", "medium", "high"].includes(override.reasoningEffort)) invalid("reasoningEffort no admitido")
        validated.reasoningEffort = override.reasoningEffort as ReasoningEffort
      }
      validatedClients[client as Target] = validated
    }
    result.models[agent as AgentName] = validatedClients
  }
  if (Object.hasOwn(root, "verification")) result.verification = validateVerificationConfiguration(root.verification)
  return result
}

export async function loadKitConfiguration(homeDir: string): Promise<KitConfiguration | null> {
  const root = path.resolve(homeDir)
  const location = path.join(root, ".ms-agent-kit/config.yaml")
  const maxBytes = 64 * 1024
  let handle
  try {
    for (const candidate of [root, path.dirname(location), location]) {
      const info = await lstat(candidate)
      if (info.isSymbolicLink()) invalid("symlinks no permitidos")
      if (candidate === location && !info.isFile()) invalid("tipo no admitido")
    }
    handle = await open(location, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const info = await handle.stat()
    if (!info.isFile() || info.size > maxBytes) invalid("tamaño o tipo no admitido")
    const content = Buffer.alloc(maxBytes + 1)
    let length = 0
    while (length < content.length) {
      const { bytesRead } = await handle.read(content, length, content.length - length)
      if (!bytesRead) break
      length += bytesRead
    }
    if (length > maxBytes) invalid("tamaño excedido")
    const document = YAML.parseDocument(content.subarray(0, length).toString("utf8"), { uniqueKeys: true })
    if (document.errors.length) invalid("YAML inválido")
    YAML.visit(document, { Alias() { invalid("aliases YAML no permitidos") } })
    return validateKitConfiguration(document.toJS({ maxAliasCount: 0 }))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  } finally { await handle?.close() }
}
