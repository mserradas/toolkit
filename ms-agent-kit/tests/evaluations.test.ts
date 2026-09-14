import { spawnSync } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { DEFAULT_ASSETS_ROOT } from "../src/core/catalog.js"

const evaluations = path.join(DEFAULT_ASSETS_ROOT, "evaluations")
const temporary: string[] = []

async function directory() {
  const result = await mkdtemp(path.join(tmpdir(), "ms-agent-evaluations-test-"))
  temporary.push(result)
  return result
}

function run(script: string, args: string[] = []) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", timeout: 10_000 })
  if (result.error) throw result.error
  return result
}

async function fixture() {
  const destination = await directory()
  await cp(path.join(evaluations, "fixture"), destination, { recursive: true })
  return destination
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((entry) => rm(entry, { recursive: true, force: true })))
})

describe("evaluaciones manuales publicables", () => {
  it("ofrece cinco prompts con criterios y archivos permitidos", async () => {
    const tasks = JSON.parse(await readFile(path.join(evaluations, "tasks.json"), "utf8"))
    expect(tasks.map((task: { id: string }) => task.id)).toEqual(["bug", "feature", "investigation", "documentation", "modules"])
    for (const task of tasks) {
      expect(task.criteria.length).toBeGreaterThanOrEqual(3)
      expect(task.allowed_changes.length).toBeGreaterThan(0)
      expect(await readFile(path.join(evaluations, task.prompt), "utf8")).toContain(`node verify.mjs ${task.id}`)
    }
  })

  it.each(["bug", "feature", "investigation", "documentation", "modules"])("detecta el estado sin resolver de %s", async (id) => {
    const root = await fixture()
    const result = run(path.join(root, "verify.mjs"), [id])
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stderr).checks).toBe("fail")
  })

  it("acepta soluciones de referencia, distingue revisión manual y mantiene el ejemplo ejecutable", async () => {
    const root = await fixture()
    const demo = run(path.join(root, "demo.mjs"))
    expect(demo.status).toBe(0)
    expect(JSON.parse(demo.stdout)).toEqual({ subtotal: 24, shipping: 4, total: 28 })
    await writeFile(path.join(root, "src/money.mjs"), 'export function total(lines) { return lines.reduce((sum, line) => sum + line.price * (line.quantity ?? 1), 0) }\n')
    await writeFile(path.join(root, "src/labels.mjs"), 'export function normalizeLabel(value) { return value.trim().toLowerCase() }\nexport function uniqueLabels(values) { return [...new Set(values.map(normalizeLabel).filter(Boolean))] }\n')
    await writeFile(path.join(root, "FINDINGS.md"), '# Causa\nEn src/shipping.mjs, shippingFee evalúa remote antes del umbral de 50. shippingFee(80, "remote") da 9; shippingFee(80, "local") da 0.\n')
    const readme = await readFile(path.join(root, "README.md"), "utf8")
    await writeFile(path.join(root, "README.md"), `${readme}\nRequiere Node 22 o posterior, sin dependencias. Ejecuta \`node demo.mjs\`. Salida: {"subtotal":24,"shipping":4,"total":28}. El envío se suma al subtotal.\n`)
    const catalog = await readFile(path.join(root, "src/catalog.mjs"), "utf8")
    await writeFile(path.join(root, "src/catalog.mjs"), `${catalog}\nexport function canFulfill(item, quantity) { return Number.isInteger(quantity) && quantity > 0 && quantity <= item.stock }\n`)
    await writeFile(path.join(root, "src/order.mjs"), 'import { findItem, canFulfill } from "./catalog.mjs"\nexport function createOrder(id, quantity) { const item = findItem(id); if (!item) throw new Error("Producto desconocido"); if (!canFulfill(item, quantity)) throw new RangeError("Cantidad no disponible"); return { id, quantity, total: item.price * quantity } }\n')
    for (const id of ["bug", "feature", "investigation", "documentation", "modules"]) {
      const result = run(path.join(root, "verify.mjs"), [id])
      expect(result.stderr).toBe("")
      expect(result.status).toBe(0)
      expect(JSON.parse(result.stdout)).toEqual({ task: id, checks: "pass", manual_review_required: ["investigation", "documentation"].includes(id) })
    }
    expect(run(path.join(root, "verify.mjs"), ["unknown"]).status).toBe(1)
  })

  it("rechaza plantillas pendientes, registros inválidos y métricas inventadas por coerción", async () => {
    const root = await directory()
    const script = path.join(evaluations, "validate-result.mjs")
    expect(run(script, [path.join(evaluations, "result-template.json")]).status).toBe(1)
    const valid = {
      client: "codex versión de prueba", model: "modelo de prueba", kit_ref: "fixture-test", fixture_ref: "fixture-test",
      task_id: "bug", repetition: 1, context_state: "cold", outcome: "pass", duration_seconds: 1.5,
      tool_calls: 0, retries: 0, unnecessary_questions: 0, tokens: null, evidence: ["Salida sintética de test; no es una ejecución de agente"],
    }
    const resultFile = path.join(root, "result.json")
    await writeFile(resultFile, JSON.stringify(valid))
    expect(run(script, [resultFile]).status).toBe(0)
    const invalid = [
      { ...valid, task_id: "missing" }, { ...valid, repetition: 0 }, { ...valid, context_state: "unknown" },
      { ...valid, outcome: "pending" }, { ...valid, tokens: -1 }, { ...valid, tool_calls: "0" },
      { ...valid, retries: 0.5 }, { ...valid, evidence: [] }, { ...valid, model: "" },
      { ...valid, duration_seconds: -1 }, { ...valid, unexpected: "extra" }, { ...valid, tokens: undefined },
    ]
    for (const record of invalid) {
      await writeFile(resultFile, JSON.stringify(record))
      const result = run(script, [resultFile])
      expect(result.status).toBe(1)
      expect(JSON.parse(result.stdout).valid).toBe(false)
    }
    await writeFile(resultFile, "{")
    expect(run(script, [resultFile]).status).toBe(1)
  })

  it.each(["delegations", "policy_denials", "budget_exhaustions", "duplicate_verifications", "rework"])("valida %s como conteo opcional sin convertir ausencias en cero", async (metric) => {
    const root = await directory()
    const script = path.join(evaluations, "validate-result.mjs")
    const template = JSON.parse(await readFile(path.join(evaluations, "result-template.json"), "utf8"))
    expect(template[metric]).toBeNull()
    const valid = {
      ...template, client: "cliente sintético", model: "modelo sintético", kit_ref: "test", fixture_ref: "test",
      outcome: "blocked", evidence: ["Observación sintética para probar validación; no es una ejecución de agente"],
    }
    const resultFile = path.join(root, "result.json")
    for (const value of [undefined, null, 0, 3, Number.MAX_SAFE_INTEGER]) {
      await writeFile(resultFile, JSON.stringify({ ...valid, [metric]: value }))
      const result = run(script, [resultFile])
      expect(result.status).toBe(0)
      expect(JSON.parse(result.stdout)).toEqual({ valid: true, errors: [] })
    }
    for (const value of [-1, 0.5, "0", false, {}, [], Number.MAX_SAFE_INTEGER + 1]) {
      await writeFile(resultFile, JSON.stringify({ ...valid, [metric]: value }))
      const result = run(script, [resultFile])
      expect(result.status).toBe(1)
      expect(JSON.parse(result.stdout).errors).toContain(`${metric} debe ser un entero seguro no negativo o null`)
    }
    await writeFile(resultFile, JSON.stringify({ ...valid, [metric]: "nonfinite" }).replace('"nonfinite"', "1e400"))
    expect(run(script, [resultFile]).status).toBe(1)
  })

  it("mide hashes y Unicode sin escribir y compara cambios de fuentes con una línea base", async () => {
    const root = await directory()
    for (const name of ["agents", "commands", "skills", "docs"]) await mkdir(path.join(root, name))
    await writeFile(path.join(root, "agents", "sample.md"), "á🙂")
    await writeFile(path.join(root, "docs", "agents-shared.md"), "Contrato")
    const script = path.join(evaluations, "measure-prompts.mjs")
    const first = run(script, ["--assets", root])
    expect(first.status).toBe(0)
    const baseline = JSON.parse(first.stdout)
    expect(baseline.files[0]).toMatchObject({ path: "agents/sample.md", bytes: 6, characters: 2 })
    expect(baseline.files[0].sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(run(script, ["--assets", root]).stdout).toBe(first.stdout)
    const baselineFile = path.join(root, "before.json")
    await writeFile(baselineFile, first.stdout)
    await writeFile(path.join(root, "agents", "sample.md"), "á🙂x")
    await writeFile(path.join(root, "skills", "extra.md"), "Nuevo")
    const compared = run(script, ["--assets", root, "--baseline", baselineFile])
    expect(compared.status).toBe(0)
    expect(JSON.parse(compared.stdout).comparison).toEqual({ bytes_delta: 6, characters_delta: 6, changed: ["agents/sample.md"], added: ["skills/extra.md"], removed: [] })
    await rm(path.join(root, "agents", "sample.md"))
    expect(JSON.parse(run(script, ["--assets", root, "--baseline", baselineFile]).stdout).comparison.removed).toEqual(["agents/sample.md"])
    await writeFile(baselineFile, JSON.stringify({ ...baseline, files: [{ ...baseline.files[0], bytes: -1 }] }))
    expect(run(script, ["--assets", root, "--baseline", baselineFile]).status).toBe(1)
    expect(run(script, ["--unknown", root]).status).toBe(1)
  })
})
