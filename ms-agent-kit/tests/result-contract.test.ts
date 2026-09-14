import { spawnSync } from "node:child_process"
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { validateResultContract } from "../src/core/result-contract.js"

const contract = { status: "completed", summary: "Misión entregada", evidence: ["src/example.ts:12"], blockers: [], risks: [], questions: [], next_action: null }
const gate = { gate: "tests", owner: "ms-codex", required: true, command: "pnpm test", result: "PASS", evidence: ["exit 0"], workspace: "sin cambios relevantes" }
const message = (value: unknown) => `Contrato para ms-architect\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``
const legacy = 'Contrato para ms-architect\n```yaml\nstatus: completed\nsummary: "Inspección finalizada"\nevidence:\n  - "ruta:símbolo"\nblockers: []\nrisks: []\nquestions: []\nnext_action: null\n```'

describe("shared terminal result contract", () => {
  it("accepts legacy YAML and additive JSON gates without asserting references are true", () => {
    expect(validateResultContract(legacy)).toMatchObject({ status: "completed" })
    expect(validateResultContract(message({ ...contract, verification: [] }))).toMatchObject({ verification: [] })
    expect(validateResultContract(message({ ...contract, verification: [gate] }))).toMatchObject({ verification: [gate] })
    expect(validateResultContract(legacy.replace("next_action: null", `next_action: null\nverification: ${JSON.stringify([gate])}`))).toMatchObject({ verification: [gate] })
  })

  it.each(["FAIL", "TIMEOUT", "NOT_RUN"])("rejects completed with required %s", (result) => {
    expect(() => validateResultContract(message({ ...contract, verification: [{ ...gate, result }] }))).toThrow("gates obligatorios")
  })

  it("accepts a completed investigation that reports a failure without pretending it passed a required gate", () => {
    expect(validateResultContract(message({ ...contract, verification: [{ ...gate, required: false, result: "FAIL" }] })).status).toBe("completed")
  })

  it.each(["partial", "blocked", "failed"])("requires an actionable %s and permits failed required gates", (status) => {
    expect(() => validateResultContract(message({ ...contract, status }))).toThrow("requieren blockers")
    expect(validateResultContract(message({ ...contract, status, blockers: ["test fallido"], next_action: "Corregir la aserción", verification: [{ ...gate, result: "FAIL" }] })).status).toBe(status)
  })

  it("requires completed evidence and no questions or blockers", () => {
    for (const delta of [{ evidence: [] }, { blockers: ["pendiente"] }, { questions: ["¿alcance?"] }]) {
      expect(() => validateResultContract(message({ ...contract, ...delta }))).toThrow("completed exige evidencia")
    }
    expect(() => validateResultContract(message({ ...contract, status: "needs_user_input" }))).toThrow("preguntas concretas")
    expect(validateResultContract(message({ ...contract, status: "needs_user_input", questions: ["¿Alcance?"] })).status).toBe("needs_user_input")
  })

  it("rejects incomplete gates, duplicate owners, invalid values and malformed contracts", () => {
    for (const verification of [null, [{ ...gate, required: "true" }], [{ ...gate, evidence: [] }], [gate, gate], [{ ...gate, result: "PARTIAL" }], [{ ...gate, command: undefined }]]) {
      expect(() => validateResultContract(message({ ...contract, verification }))).toThrow()
    }
    expect(() => validateResultContract(message({ ...contract, status: ["completed"], evidence: [] }))).toThrow("estado terminal")
    expect(() => validateResultContract(message({ ...contract, verification: [{ ...gate, result: ["PASS"] }] }))).toThrow("result debe")
    expect(() => validateResultContract(message({ ...contract, private_payload: "hidden" }))).toThrow("campo desconocido en contrato")
    for (const input of ["status: completed", legacy + "\nextra", legacy + "\n" + legacy, legacy.replace("status: completed", "status: completed\nstatus: failed"), legacy.replace("summary:", "summary: |\n  body:"), message(contract).replace('"summary":', '"status":"failed","summary":'), message(contract).replace('"summary":', '"sta\\u0074us":"failed","summary":'), message(contract).replace("null", "undefined")]) {
      expect(() => validateResultContract(input)).toThrow()
    }
  })

  it("bounds resources and rejects YAML aliases, tags and unsupported nesting", () => {
    for (const input of ["x".repeat(65_537), legacy.replace('"Inspección finalizada"', "&alias texto"), legacy.replace('"Inspección finalizada"', "!!str texto"), message({ ...contract, evidence: Array(101).fill("x") }), message({ ...contract, verification: [[[[[[[[[]]]]]]]]] })]) {
      expect(() => validateResultContract(input)).toThrow()
    }
  })

  it("uses the same validation through the portable CLI with bounded input", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ms-result-"))
    try {
      const file = path.join(root, "result.md")
      await writeFile(file, message({ ...contract, verification: [gate] }))
      const run = () => spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "result", "validate", "--file", file, "--json"], { encoding: "utf8", timeout: 30_000 })
      const valid = run()
      expect(valid.status, valid.stderr).toBe(0)
      expect(JSON.parse(valid.stdout)).toEqual({ valid: true, status: "completed", verificationDeclared: true })
      await writeFile(file, message({ ...contract, verification: [{ ...gate, result: "FAIL" }] }))
      const invalid = run()
      expect(invalid.status).toBe(2)
      expect(invalid.stderr).toContain("gates obligatorios")
      await writeFile(file, "x".repeat(262_145))
      expect(run().status).toBe(2)
      await rm(file)
      const secret = path.join(root, ".env")
      await writeFile(secret, "SENSITIVE_CONTENT")
      await symlink(secret, file)
      const sensitive = run()
      expect(sensitive.status).toBe(2)
      expect(sensitive.stderr).toContain("Ruta sensible")
      expect(sensitive.stderr).not.toContain("SENSITIVE_CONTENT")
      await rm(file)
      const safe = path.join(root, "safe.md")
      await writeFile(safe, message(contract))
      await symlink(safe, file)
      expect(run().stderr).toContain("sin symlink")
      await rm(file)
      const fifo = spawnSync("mkfifo", [file], { timeout: 5000 })
      expect(fifo.status).toBe(0)
      expect(run().stderr).toContain("archivo regular")
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
