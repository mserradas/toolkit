import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { nextWorkflowAction, readWorkflowStatus } from "../src/core/workflow.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-workflow-"))
  temporaryDirectories.push(root)
  await mkdir(path.join(root, ".atl", "status"), { recursive: true })
  return root
}

function ledger(overrides: Partial<Record<string, unknown>> = {}): string {
  const values = {
    schema: "ms-progress",
    slug: "checkout",
    status: "in_progress",
    objective: "Complete checkout validation",
    next_action: "Run the integration test",
    completed: ["Endpoint implemented"],
    pending: ["Integration test"],
    files: ["src/checkout.ts"],
    risks: [],
    updated_at: "2026-07-17T20:00:00Z",
    ...overrides,
  }
  const yaml = Object.entries(values).map(([key, value]) =>
    Array.isArray(value)
      ? `${key}: [${value.map((item) => JSON.stringify(item)).join(", ")}]`
      : `${key}: ${JSON.stringify(value)}`
  ).join("\n")
  return `---\n${yaml}\n---\n\n# Progreso\n`
}

describe("manual progress checkpoints", () => {
  it("returns one next action from a valid temporary checkpoint", async () => {
    const root = await project()
    await writeFile(path.join(root, ".atl", "status", "checkout-progress.md"), ledger())
    const status = await readWorkflowStatus(root, "checkout")
    expect(status).toMatchObject({
      schema: "ms-progress",
      structured: true,
      status: "in_progress",
      objective: "Complete checkout validation",
      nextAction: "Run the integration test",
      completed: ["Endpoint implemented"],
      pending: ["Integration test"],
    })
    expect(nextWorkflowAction(status)).toMatchObject({
      schema: "ms-workflow-next/v3",
      ready: true,
      action: "Run the integration test",
    })
  })

  it("does not continue a blocked checkpoint", async () => {
    const root = await project()
    await writeFile(
      path.join(root, ".atl", "status", "checkout-progress.md"),
      ledger({ status: "blocked", risks: ["Needs product decision"] }),
    )
    const next = nextWorkflowAction(await readWorkflowStatus(root, "checkout"))
    expect(next).toMatchObject({ ready: false, action: null })
    expect(next.reason).toContain("bloqueado")
  })

  it("reports incomplete legacy checkpoints with low confidence", async () => {
    const root = await project()
    await writeFile(path.join(root, ".atl", "status", "legacy-progress.md"), "# Old progress\n")
    const status = await readWorkflowStatus(root, "legacy")
    expect(status).toMatchObject({ structured: false, confidence: "low" })
    expect(status.warnings.length).toBeGreaterThan(0)
  })

  it("rejects ambiguous names and paths outside .atl/status", async () => {
    const root = await project()
    await writeFile(path.join(root, ".atl", "status", "cart-api-progress.md"), ledger({ slug: "cart-api" }))
    await writeFile(path.join(root, ".atl", "status", "cart-ui-progress.md"), ledger({ slug: "cart-ui" }))
    await expect(readWorkflowStatus(root, "cart")).rejects.toThrow("Slug ambiguo")
    await expect(readWorkflowStatus(root, "../outside.md")).rejects.toThrow()
  })
})
