import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildArtifacts } from "../src/adapters/index.js"
import { DEFAULT_ASSETS_ROOT } from "../src/core/catalog.js"
import { parseMarkdown } from "../src/core/frontmatter.js"

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

describe("native client permissions", () => {
  it.each(["user", "project"] as const)("never adds permission overrides in %s scope, without kit turn limits or result hooks", async (scope) => {
    const root = await mkdtemp(path.join(tmpdir(), "ms-native-permissions-"))
    roots.push(root)
    const context = { scope, projectRoot: root, homeDir: path.join(root, "home"), assetsRoot: DEFAULT_ASSETS_ROOT }
    const artifacts = await buildArtifacts(["opencode", "claude", "codex"], context)
    expect(artifacts.some((item) => ["ms-secrets", "ms-agent-guard", "ms-result-validator"].includes(item.name))).toBe(false)
    expect(artifacts.some((item) => item.destination.endsWith(".rules"))).toBe(false)
    expect(artifacts.some((item) => /settings(?:\.local)?\.json$/.test(item.destination))).toBe(false)
    for (const item of artifacts) {
      const content = item.content.toString()
      expect(content).not.toContain("Presupuesto operativo objetivo")
      expect(content).not.toContain("Al agotar el ciclo")
      if (item.target === "codex" && ["agent", "configuration"].includes(item.kind)) {
        expect(content).not.toMatch(/^(?:default_permissions|sandbox_mode|approval_policy|web_search)\s*=/m)
        expect(content).not.toMatch(/^\[permissions[.\]]/m)
      }
      if (item.target === "opencode" && item.name === "opencode.json") expect(JSON.parse(content).permission).toEqual({})
      if (item.target !== "codex" && ["agent", "command", "skill"].includes(item.kind) && item.destination.endsWith(".md")) {
        const metadata = parseMarkdown(content).frontmatter
        for (const field of ["permissionMode", "tools", "disallowedTools", "allowed-tools", "steps", "maxTurns", "hooks"]) expect(metadata, item.destination).not.toHaveProperty(field)
        if (item.target === "opencode" && item.kind === "agent") expect(metadata.permission).toEqual({})
        else expect(metadata).not.toHaveProperty("permission")
      }
    }
  })
})
