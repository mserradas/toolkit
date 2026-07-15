import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { nextWorkflowAction, readWorkflowStatus } from "../src/core/workflow.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ms-agent-kit-workflow-"))
  temporaryDirectories.push(root)
  await mkdir(path.join(root, "docs", "status"), { recursive: true })
  return root
}

function ledger(overrides: Partial<Record<string, string | number | boolean | null>> = {}): string {
  const values = {
    schema: "ms-progress/v1",
    slug: "checkout",
    phase: "implementation",
    level: 3,
    status: "in_progress",
    active_package: "P2",
    next_action: "implement_package",
    blocked: false,
    updated_at: "2026-07-15T10:00:00Z",
    ...overrides,
  }
  const scalar = (value: string | number | boolean | null) =>
    value === null ? "null" : typeof value === "string" ? JSON.stringify(value) : String(value)

  return `---\n${Object.entries(values)
    .map(([key, value]) => `${key}: ${scalar(value)}`)
    .join("\n")}\nartifacts:\n  prd: null\n  spec: "docs/spec/checkout.md"\n  tdd: "docs/design/checkout.md"\n---\n\n# Progreso\n`
}

describe("structured workflow status", () => {
  it("returns the next executable action from a valid ledger", async () => {
    const root = await project()
    await writeFile(path.join(root, "docs", "status", "checkout-progress.md"), ledger())

    const status = await readWorkflowStatus(root, "checkout")
    const next = nextWorkflowAction(status)

    expect(status).toMatchObject({
      schema: "ms-progress/v1",
      structured: true,
      confidence: "high",
      activePackage: "P2",
      nextAction: "implement_package",
      warnings: [],
    })
    expect(next).toMatchObject({ ready: true, action: "implement_package", activePackage: "P2" })
  })

  it("stops on blocked, closed, and legacy ledgers", async () => {
    const root = await project()
    const statusRoot = path.join(root, "docs", "status")
    await writeFile(
      path.join(statusRoot, "blocked-progress.md"),
      ledger({
        slug: "blocked",
        phase: "verification",
        status: "blocked",
        active_package: null,
        next_action: "ask_user",
        blocked: true,
      }),
    )
    await writeFile(
      path.join(statusRoot, "closed-progress.md"),
      ledger({
        slug: "closed",
        phase: "closure",
        status: "closed",
        active_package: null,
        next_action: "stop",
      }),
    )
    await writeFile(path.join(statusRoot, "legacy-progress.md"), "# Estado MS\n\nSiguiente: implementar P2\n")

    expect(nextWorkflowAction(await readWorkflowStatus(root, "blocked"))).toMatchObject({
      ready: false,
      action: "ask_user",
    })
    expect(nextWorkflowAction(await readWorkflowStatus(root, "closed"))).toMatchObject({
      ready: false,
      action: "stop",
    })
    expect(nextWorkflowAction(await readWorkflowStatus(root, "legacy"))).toMatchObject({
      ready: false,
      action: null,
      status: { structured: false, confidence: "low" },
    })
  })

  it("rejects ambiguous workflows and paths outside docs/status", async () => {
    const root = await project()
    await writeFile(path.join(root, "docs", "status", "cart-api-progress.md"), ledger({ slug: "cart-api" }))
    await writeFile(path.join(root, "docs", "status", "cart-ui-progress.md"), ledger({ slug: "cart-ui" }))

    await expect(readWorkflowStatus(root, "cart")).rejects.toThrow("Slug ambiguo")
    await expect(readWorkflowStatus(root, "../outside.md")).rejects.toThrow()
  })

  it("marks omitted nullable fields and filename drift as unstructured", async () => {
    const root = await project()
    const file = path.join(root, "docs", "status", "wrong-progress.md")
    await writeFile(
      file,
      ledger()
        .replace('active_package: "P2"\n', "")
        .replace("  tdd: \"docs/design/checkout.md\"\n", ""),
    )

    const status = await readWorkflowStatus(root, "wrong")
    expect(status.structured).toBe(false)
    expect(status.warnings).toEqual(
      expect.arrayContaining([
        "El slug checkout no coincide con el archivo wrong-progress.md",
        "Campo requerido invalido o ausente: active_package",
        "Campo requerido invalido o ausente: artifacts.tdd",
      ]),
    )
  })
})
