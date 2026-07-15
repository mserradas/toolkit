import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import MsModelVariantsPlugin from "../assets/opencode/plugins/ms-model-variants.js"

const { connectedProviderIds, MODEL_CACHE_TTL_MS, refreshModelVariantsCache } =
  MsModelVariantsPlugin.__test

type ModelCache = {
  schemaVersion: number
  providerFilter: string[]
  models: Record<string, string[]>
}

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

const providerList = [
  {
    id: "openai",
    models: {
      "gpt-5.6-luna": { variants: { low: {}, medium: {} } },
      "gpt-5.6-sol": { variants: { high: {}, medium: {} } },
    },
  },
  {
    id: "anthropic",
    models: {
      "claude-sonnet": { variants: { thinking: {} } },
    },
  },
]

describe("model variants cache", () => {
  it("derives the providers connected in the OpenCode provider response", () => {
    expect(
      connectedProviderIds({ data: { all: providerList, connected: ["openai", "openai"] } }),
    ).toEqual(["openai"])
  })

  it("filters providers and reuses a fresh cache without listing providers again", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-model-cache-"))
    temporaryDirectories.push(cacheDir)
    const now = Date.parse("2026-07-15T12:00:00.000Z")
    let calls = 0
    const listProviders = async () => {
      calls += 1
      return { data: { all: providerList, connected: ["openai"] } }
    }

    const first = await refreshModelVariantsCache({
      cacheDir,
      resolveProviderFilter: connectedProviderIds,
      listProviders,
      now,
    })
    expect(first).toMatchObject({ cacheHit: false, providers: 1, models: 2 })
    const cache = JSON.parse(await readFile(first.cachePath, "utf8")) as ModelCache
    expect(cache).toMatchObject({
      schemaVersion: 2,
      providerFilter: ["openai"],
      models: { openai: ["gpt-5.6-luna", "gpt-5.6-sol"] },
    })
    expect(cache.models).not.toHaveProperty("anthropic")

    const second = await refreshModelVariantsCache({
      cacheDir,
      resolveProviderFilter: connectedProviderIds,
      listProviders,
      now: now + MODEL_CACHE_TTL_MS - 1,
    })
    expect(second).toMatchObject({ cacheHit: true, providers: 1, models: 2 })
    expect(calls).toBe(1)
  })

  it("refreshes an expired cache and preserves it when provider discovery fails", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-model-cache-failure-"))
    temporaryDirectories.push(cacheDir)
    const now = Date.parse("2026-07-15T12:00:00.000Z")
    const first = await refreshModelVariantsCache({
      cacheDir,
      providerFilter: ["openai"],
      listProviders: async () => providerList,
      now,
    })
    const previous = await readFile(first.cachePath, "utf8")

    await expect(
      refreshModelVariantsCache({
        cacheDir,
        providerFilter: ["openai"],
        listProviders: async () => {
          throw new Error("provider unavailable")
        },
        now: now + MODEL_CACHE_TTL_MS,
      }),
    ).rejects.toThrow("provider unavailable")
    expect(await readFile(first.cachePath, "utf8")).toBe(previous)
  })

  it("invalidates a fresh cache when the configured provider set changes", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-model-cache-filter-"))
    temporaryDirectories.push(cacheDir)
    const now = Date.parse("2026-07-15T12:00:00.000Z")
    let calls = 0
    const listProviders = async () => {
      calls += 1
      return providerList
    }
    await refreshModelVariantsCache({
      cacheDir,
      providerFilter: ["openai"],
      listProviders,
      now,
    })
    const changed = await refreshModelVariantsCache({
      cacheDir,
      providerFilter: ["anthropic"],
      listProviders,
      now: now + 1,
    })

    expect(changed).toMatchObject({ cacheHit: false, providers: 1, models: 1 })
    expect(calls).toBe(2)
  })
})
