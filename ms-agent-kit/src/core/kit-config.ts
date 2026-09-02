import { constants } from "node:fs"
import { lstat, open } from "node:fs/promises"
import path from "node:path"
import YAML from "yaml"
import { AppError } from "./errors.js"
import type { ModelProfileName, ReasoningEffort } from "./model-profiles.js"
import { assertNoEmbeddedSecrets } from "./security.js"
import { TARGETS, type Target } from "./types.js"

export interface ModelOverride { model?: string; reasoningEffort?: ReasoningEffort }
export interface KitConfiguration {
  schemaVersion: 1
  models: Partial<Record<ModelProfileName, Partial<Record<Target, ModelOverride>>>>
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
  const root = object(value, ["schemaVersion", "models"])
  if (root.schemaVersion !== 1) invalid("schemaVersion no soportada")
  const models = object(root.models, ["strong", "balanced", "light", "fast"])
  const result: KitConfiguration = { schemaVersion: 1, models: {} }
  for (const [profile, clients] of Object.entries(models)) {
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
    result.models[profile as ModelProfileName] = validatedClients
  }
  return result
}

export async function loadKitConfiguration(homeDir: string): Promise<KitConfiguration | null> {
  const root = path.resolve(homeDir)
  const location = path.join(root, ".ms-agent-kit/config.yaml")
  const maxBytes = 64 * 1024
  let handle
  try {
    for (const candidate of [root, path.dirname(location), location]) {
      if ((await lstat(candidate)).isSymbolicLink()) invalid("symlinks no permitidos")
    }
    handle = await open(location, constants.O_RDONLY | constants.O_NOFOLLOW)
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
