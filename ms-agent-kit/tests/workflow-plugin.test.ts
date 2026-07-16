import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import MsWorkflowToolsPlugin from "../assets/opencode/plugins/ms-workflow-tools.js"
import { nextWorkflowAction, readWorkflowStatus } from "../src/core/workflow.js"
import { fingerprintReview } from "../src/core/review.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" })
}

function ledger(): string {
  return `---
schema: ms-progress/v1
slug: checkout
phase: implementation
level: 3
status: in_progress
active_package: P2
next_action: implement_package
blocked: false
artifacts:
  prd: null
  spec: docs/spec/checkout.md
  tdd: docs/design/checkout.md
updated_at: 2026-07-16T10:00:00Z
---

# Progreso
`
}

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ms-workflow-plugin-"))
  temporaryDirectories.push(root)
  await mkdir(path.join(root, "docs", "status"), { recursive: true })
  await writeFile(path.join(root, "docs", "status", "checkout-progress.md"), ledger())
  return root
}

describe("OpenCode workflow tools", () => {
  it("exports only the default plugin and registers the three native tools", async () => {
    const module = await import("../assets/opencode/plugins/ms-workflow-tools.js")
    expect(Object.keys(module)).toEqual(["default"])

    const root = await project()
    const hooks = await MsWorkflowToolsPlugin({ directory: root, worktree: root } as never)
    expect(Object.keys(hooks.tool ?? {}).sort()).toEqual([
      "ms_review_fingerprint",
      "ms_workflow_next",
      "ms_workflow_status",
    ])
  })

  it("matches the core workflow contract and returns structured tool output", async () => {
    const root = await project()
    const pluginStatus = await MsWorkflowToolsPlugin.__test.readWorkflowStatus(root, "checkout")
    const coreStatus = await readWorkflowStatus(root, "checkout")
    expect(pluginStatus).toEqual(coreStatus)
    expect(MsWorkflowToolsPlugin.__test.nextWorkflowAction(pluginStatus)).toEqual(
      nextWorkflowAction(coreStatus),
    )

    const hooks = await MsWorkflowToolsPlugin({ directory: root, worktree: root } as never)
    const result = await hooks.tool!.ms_workflow_next!.execute(
      { requested: "checkout" },
      { directory: root } as never,
    )
    if (typeof result === "string") throw new Error("La herramienta debe devolver salida estructurada")
    expect(JSON.parse(result.output)).toMatchObject({
      schema: "ms-workflow-next/v1",
      ready: true,
      action: "implement_package",
      activePackage: "P2",
    })
  })

  it("matches the deterministic review fingerprint and rejects secret paths", async () => {
    const root = await project()
    git(root, "init", "--quiet")
    git(root, "config", "user.email", "tests@example.com")
    git(root, "config", "user.name", "Tests")
    git(root, "add", "docs/status/checkout-progress.md")
    git(root, "commit", "--quiet", "-m", "baseline")
    await writeFile(path.join(root, "feature.ts"), "export const feature = true\n")

    expect(await MsWorkflowToolsPlugin.__test.fingerprintReview(root, "worktree")).toEqual(
      await fingerprintReview(root, "worktree"),
    )

    await writeFile(path.join(root, ".env.private"), "TOKEN=secret\n")
    await expect(
      MsWorkflowToolsPlugin.__test.fingerprintReview(root, "worktree"),
    ).rejects.toThrow("ruta sensible")
  })
})
