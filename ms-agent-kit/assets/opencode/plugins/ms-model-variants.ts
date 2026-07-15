/** Cachea solo los modelos relevantes para los agentes instalados, con TTL. */

import type { Plugin } from "@opencode-ai/plugin"
import { randomBytes } from "crypto"
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "fs/promises"
import { homedir } from "os"
import path from "path"

const CACHE_SCHEMA_VERSION = 2
const CACHE_FILE = "model-variants.json"
const MODEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const STALE_TMP_MAX_AGE_MS = 10 * 60 * 1000

type ModelVariants = Record<string, Record<string, string[]>>

type ModelCache = {
  schemaVersion: number
  generatedAt: string
  source: "opencode-provider-list"
  providerFilter: string[]
  models: Record<string, string[]>
  variants: ModelVariants
}

interface ModelCacheRefreshResult {
  cacheHit: boolean
  cachePath: string
  providers: number
  models: number
}

function isIgnorableFileRace(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  )
}

async function removeOwnTempFile(temporaryPath: string): Promise<void> {
  try {
    await rm(temporaryPath, { force: true })
  } catch (error) {
    if (!isIgnorableFileRace(error)) {
      console.error("[ms-model-variants] temp cleanup failed:", error)
    }
  }
}

async function removeStaleTempFiles(cacheDir: string): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(cacheDir)
  } catch (error) {
    if (!isIgnorableFileRace(error)) {
      console.error("[ms-model-variants] temp scan failed:", error)
    }
    return
  }

  const now = Date.now()
  for (const entry of entries) {
    if (!entry.startsWith(`${CACHE_FILE}.`) || !entry.endsWith(".tmp")) continue

    const temporaryPath = path.join(cacheDir, entry)
    try {
      const info = await stat(temporaryPath)
      if (now - info.mtimeMs > STALE_TMP_MAX_AGE_MS) {
        await rm(temporaryPath, { force: true })
      }
    } catch (error) {
      if (!isIgnorableFileRace(error)) {
        console.error("[ms-model-variants] stale temp cleanup failed:", error)
      }
    }
  }
}

function providerListFrom(result: unknown): unknown[] {
  const data = (result as { data?: unknown } | null)?.data ?? result
  const record = data as { all?: unknown; providers?: unknown } | null
  const list = record?.all ?? record?.providers ?? data
  return Array.isArray(list) ? list : []
}

function connectedProviderIds(result: unknown): string[] {
  const data = (result as { data?: unknown } | null)?.data ?? result
  const connected = (data as { connected?: unknown } | null)?.connected
  return Array.isArray(connected)
    ? [...new Set(connected.filter((value): value is string => typeof value === "string"))].sort()
    : []
}

function buildModelCache(
  providerList: unknown[],
  providerFilter: string[],
  generatedAt: string,
): ModelCache {
  const models: Record<string, string[]> = {}
  const variants: ModelVariants = {}
  const allowedProviders = new Set(providerFilter)

  for (const providerValue of providerList) {
    const provider = providerValue as {
      id?: unknown
      models?: Record<string, { variants?: Record<string, unknown> } | undefined>
    }
    const providerID = provider?.id
    if (typeof providerID !== "string" || providerID.length === 0) continue
    if (allowedProviders.size > 0 && !allowedProviders.has(providerID)) continue

    const providerModels =
      provider.models && typeof provider.models === "object" ? provider.models : {}
    const modelIDs = Object.keys(providerModels).sort()
    models[providerID] = modelIDs

    for (const modelID of modelIDs) {
      const model = providerModels[modelID]
      const modelVariants =
        model?.variants && typeof model.variants === "object"
          ? Object.keys(model.variants).sort()
          : []
      if (modelVariants.length === 0) continue

      variants[providerID] ??= {}
      variants[providerID][modelID] = modelVariants
    }
  }

  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    generatedAt,
    source: "opencode-provider-list",
    providerFilter,
    models,
    variants,
  }
}

function sameStrings(left: unknown, right: string[]): boolean {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

async function readFreshCache(
  cachePath: string,
  providerFilter: string[] | null,
  now: number,
): Promise<ModelCache | null> {
  try {
    const cache = JSON.parse(await readFile(cachePath, "utf8")) as Partial<ModelCache>
    const generatedAt = Date.parse(cache.generatedAt ?? "")
    const age = now - generatedAt
    if (
      cache.schemaVersion === CACHE_SCHEMA_VERSION &&
      cache.source === "opencode-provider-list" &&
      (providerFilter === null || sameStrings(cache.providerFilter, providerFilter)) &&
      Number.isFinite(generatedAt) &&
      age >= 0 &&
      age < MODEL_CACHE_TTL_MS &&
      cache.models &&
      cache.variants
    ) {
      return cache as ModelCache
    }
  } catch (error) {
    if (!isIgnorableFileRace(error) && !(error instanceof SyntaxError)) throw error
  }
  return null
}

function cacheCounts(cache: ModelCache): Pick<ModelCacheRefreshResult, "providers" | "models"> {
  return {
    providers: Object.keys(cache.models).length,
    models: Object.values(cache.models).reduce((total, entries) => total + entries.length, 0),
  }
}

async function refreshModelVariantsCache(input: {
  cacheDir: string
  providerFilter?: string[]
  resolveProviderFilter?: (result: unknown) => string[]
  listProviders: () => Promise<unknown>
  force?: boolean
  now?: number
}): Promise<ModelCacheRefreshResult> {
  const expectedProviderFilter = input.providerFilter
    ? [...new Set(input.providerFilter)].sort()
    : null
  const now = input.now ?? Date.now()
  const cachePath = path.join(input.cacheDir, CACHE_FILE)
  if (!input.force) {
    const cached = await readFreshCache(
      cachePath,
      expectedProviderFilter,
      now,
    )
    if (cached) return { cacheHit: true, cachePath, ...cacheCounts(cached) }
  }

  const result = await input.listProviders()
  const providerFilter = expectedProviderFilter ?? [
    ...new Set(input.resolveProviderFilter?.(result) ?? []),
  ].sort()
  const cache = buildModelCache(providerListFrom(result), providerFilter, new Date(now).toISOString())
  await mkdir(input.cacheDir, { recursive: true })
  await removeStaleTempFiles(input.cacheDir)

  const temporaryPath = path.join(
    input.cacheDir,
    `${CACHE_FILE}.${randomBytes(3).toString("hex")}.tmp`,
  )
  try {
    await writeFile(temporaryPath, JSON.stringify(cache, null, 2))
    await rename(temporaryPath, cachePath)
  } catch (error) {
    await removeOwnTempFile(temporaryPath)
    throw error
  }

  return { cacheHit: false, cachePath, ...cacheCounts(cache) }
}

const modelVariantsPlugin: Plugin = async (input) => {
  void refreshModelVariantsCache({
    cacheDir: path.join(homedir(), ".config", "opencode", "cache"),
    resolveProviderFilter: connectedProviderIds,
    listProviders: () => input.client.provider.list(),
  }).catch((error) => {
    console.error("[ms-model-variants] cache refresh failed:", error)
  })
  return {}
}

const MsModelVariantsPlugin = Object.assign(modelVariantsPlugin, {
  __test: {
    connectedProviderIds,
    MODEL_CACHE_TTL_MS,
    refreshModelVariantsCache,
  },
})

export default MsModelVariantsPlugin
