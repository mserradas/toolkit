import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const task = process.argv[2]
const checks = {
  async bug() {
    const { total } = await import("./src/money.mjs")
    assert.equal(total([{ price: 12, quantity: 0 }]), 0)
    assert.equal(total([{ price: 12, quantity: 2 }, { price: 3 }]), 27)
    assert.equal(total([{ price: 12, quantity: 0 }, { price: 3, quantity: 2 }]), 6)
    assert.equal(total([]), 0)
  },
  async feature() {
    const { normalizeLabel, uniqueLabels } = await import("./src/labels.mjs")
    assert.equal(typeof uniqueLabels, "function")
    const input = Object.freeze([" Beta ", "alpha", "BETA", "", "  ", "ÁRBOL", "árbol"])
    assert.deepEqual(uniqueLabels(input), ["beta", "alpha", "árbol"])
    assert.deepEqual(uniqueLabels([]), [])
    assert.equal(normalizeLabel("  AbC  "), "abc")
  },
  async investigation() {
    const { shippingFee } = await import("./src/shipping.mjs")
    assert.equal(shippingFee(80, "remote"), 9)
    assert.equal(shippingFee(80, "local"), 0)
    const note = await readFile(new URL("FINDINGS.md", import.meta.url), "utf8")
    for (const literal of ["src/shipping.mjs", "shippingFee", "remote", "local", "80", "9", "0"]) {
      assert.ok(note.includes(literal), `Falta evidencia documental: ${literal}`)
    }
  },
  async documentation() {
    const note = await readFile(new URL("README.md", import.meta.url), "utf8")
    for (const literal of ["Tienda de ejemplo", "Fixture pequeño", "Node", "22", "sin dependencias", "node demo.mjs", "subtotal", "shipping", "total", "24", "4", "28"]) {
      assert.ok(note.includes(literal), `Falta evidencia documental: ${literal}`)
    }
  },
  async modules() {
    const { catalog, canFulfill } = await import("./src/catalog.mjs")
    const { createOrder } = await import("./src/order.mjs")
    const initial = JSON.stringify(catalog)
    assert.equal(typeof canFulfill, "function")
    assert.equal(canFulfill(catalog[0], 3), true)
    for (const quantity of [0, -1, 1.5, 4, NaN, Infinity, "1"]) {
      assert.equal(canFulfill(catalog[0], quantity), false)
      assert.throws(() => createOrder("book", quantity), RangeError)
    }
    assert.equal(canFulfill(catalog[1], 1), false)
    assert.throws(() => createOrder("pen", 1), RangeError)
    assert.throws(() => createOrder("missing", 1), /Producto desconocido/)
    assert.deepEqual(createOrder("book", 2), { id: "book", quantity: 2, total: 24 })
    assert.equal(JSON.stringify(catalog), initial)
  },
}

try {
  assert.ok(Object.hasOwn(checks, task), "Tarea válida: bug, feature, investigation, documentation o modules")
  await checks[task]()
  console.log(JSON.stringify({ task, checks: "pass", manual_review_required: ["investigation", "documentation"].includes(task) }))
} catch (error) {
  console.error(JSON.stringify({ task: task ?? null, checks: "fail", reason: error.message }))
  process.exitCode = 1
}
