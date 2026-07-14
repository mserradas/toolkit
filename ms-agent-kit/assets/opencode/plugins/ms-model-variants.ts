/**
 * ms-model-variants
 *
 * Cachea modelos y variantes expuestas por los providers de OpenCode para
 * poder revisar la asignacion de modelos de los agentes ms-* sin depender de
 * Gentle AI ni de una conexion viva durante la conversacion.
 */

import type { Plugin } from "@opencode-ai/plugin"
import { randomBytes } from "crypto"
import { mkdir, readdir, rename, rm, stat, writeFile } from "fs/promises"
import { homedir } from "os"
import path from "path"

const CACHE_SCHEMA_VERSION = 1
const CACHE_FILE = "model-variants.json"
const STALE_TMP_MAX_AGE_MS = 10 * 60 * 1000

type ModelVariants = Record<string, Record<string, string[]>>

type ModelCache = {
  schemaVersion: number
  generatedAt: string
  source: "opencode-provider-list"
  models: Record<string, string[]>
  variants: ModelVariants
}

function isIgnorableFileRace(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "ENOENT"
}

async function removeOwnTempFile(tmpPath: string) {
  try {
    await rm(tmpPath, { force: true })
  } catch (err) {
    if (!isIgnorableFileRace(err)) {
      console.error("[ms-model-variants] temp cleanup failed:", err)
    }
  }
}

async function removeStaleTempFiles(cacheDir: string) {
  let entries: string[]
  try {
    entries = await readdir(cacheDir)
  } catch (err) {
    if (!isIgnorableFileRace(err)) {
      console.error("[ms-model-variants] temp scan failed:", err)
    }
    return
  }

  const now = Date.now()
  for (const entry of entries) {
    if (!entry.startsWith(`${CACHE_FILE}.`) || !entry.endsWith(".tmp")) continue

    const tmpPath = path.join(cacheDir, entry)
    try {
      const info = await stat(tmpPath)
      if (now - info.mtimeMs > STALE_TMP_MAX_AGE_MS) {
        await rm(tmpPath, { force: true })
      }
    } catch (err) {
      if (!isIgnorableFileRace(err)) {
        console.error("[ms-model-variants] stale temp cleanup failed:", err)
      }
    }
  }
}

function providerListFrom(result: unknown): any[] {
  const data = (result as any)?.data ?? result
  const list = (data as any)?.all ?? (data as any)?.providers ?? data
  return Array.isArray(list) ? list : []
}

function buildCache(providerList: any[]): ModelCache {
  const models: Record<string, string[]> = {}
  const variants: ModelVariants = {}

  for (const provider of providerList) {
    const providerID = provider?.id
    if (typeof providerID !== "string" || providerID.length === 0) continue

    const providerModels = provider?.models && typeof provider.models === "object" ? provider.models : {}
    const modelIDs = Object.keys(providerModels).sort()
    models[providerID] = modelIDs

    for (const modelID of modelIDs) {
      const model = providerModels[modelID]
      const modelVariants = model?.variants && typeof model.variants === "object" ? Object.keys(model.variants).sort() : []
      if (modelVariants.length === 0) continue

      variants[providerID] = variants[providerID] || {}
      variants[providerID][modelID] = modelVariants
    }
  }

  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: "opencode-provider-list",
    models,
    variants,
  }
}

export const MsModelVariantsPlugin: Plugin = async (input) => {
  async function refreshCache() {
    let tmpPath: string | undefined

    try {
      const result = await input.client.provider.list()
      const cache = buildCache(providerListFrom(result))
      const cacheDir = path.join(homedir(), ".config", "opencode", "cache")
      await mkdir(cacheDir, { recursive: true })
      await removeStaleTempFiles(cacheDir)

      const finalPath = path.join(cacheDir, CACHE_FILE)
      tmpPath = path.join(cacheDir, `${CACHE_FILE}.${randomBytes(3).toString("hex")}.tmp`)
      await writeFile(tmpPath, JSON.stringify(cache, null, 2))
      await rename(tmpPath, finalPath)
      tmpPath = undefined
    } catch (err) {
      console.error("[ms-model-variants] cache refresh failed:", err)
    } finally {
      if (tmpPath) {
        await removeOwnTempFile(tmpPath)
      }
    }
  }

  refreshCache().catch((err) => {
    console.error("[ms-model-variants] unexpected refresh error:", err)
  })

  return {}
}

export default MsModelVariantsPlugin
