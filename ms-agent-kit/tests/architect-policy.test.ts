import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { DEFAULT_ASSETS_ROOT } from "../src/core/catalog.js"
import { parseMarkdown } from "../src/core/frontmatter.js"

describe("ms-architect policy", () => {
  it("stays compact while preserving orchestration and safety gates", async () => {
    const source = await readFile(path.join(DEFAULT_ASSETS_ROOT, "agents", "ms-architect.md"), "utf8")
    const body = parseMarkdown(source).body

    expect(body.split("\n").length).toBeLessThanOrEqual(260)
    for (const contract of [
      "No editas archivos",
      "`ms-project-init`",
      "`delegation-brief`",
      "`work-unit-commits`",
      "`judgment-day`",
      "ms_workflow_next",
      "ms_review_fingerprint",
      "Security Smoke Gate",
    ]) {
      expect(body).toContain(contract)
    }
    for (const level of ["| 0. Respuesta", "| 1. Fastlane", "| 2. Ejecución simple", "| 3. Paquetes", "| 4. Programa/TDD"]) {
      expect(body).toContain(level)
    }
    expect(body).not.toContain("## Estado MS")
    expect(body).not.toContain("## Retomar MS")
  })

  it("keeps orchestration protocols gated to coordinators", async () => {
    const skillPaths = [
      ["ms-project-init", "Esta skill la coordina únicamente `ms-architect`"],
      ["delegation-brief", "Úsala solo desde `ms-architect` u otro orquestador autorizado"],
      ["work-unit-commits", "Puede usarla `ms-architect` para routing o `ms-designer`"],
      ["judgment-day", "La skill coordina jueces"],
    ] as const

    for (const [name, guard] of skillPaths) {
      const source = await readFile(path.join(DEFAULT_ASSETS_ROOT, "skills", name, "SKILL.md"), "utf8")
      expect(source).toContain(guard)
    }
  })
})
