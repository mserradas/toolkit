import { readFile } from "node:fs/promises"

const tasks = JSON.parse(await readFile(new URL("tasks.json", import.meta.url), "utf8"))
const required = ["client", "model", "kit_ref", "fixture_ref", "task_id", "repetition", "context_state", "outcome", "duration_seconds", "tool_calls", "retries", "unnecessary_questions", "tokens", "evidence"]

function validate(value) {
  const errors = []
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["Se requiere un objeto de resultado"]
  for (const key of required) if (!Object.hasOwn(value, key)) errors.push(`Falta ${key}`)
  for (const key of Object.keys(value)) if (!required.includes(key)) errors.push(`Campo desconocido: ${key}`)
  for (const key of ["client", "model", "kit_ref", "fixture_ref"]) {
    if (typeof value[key] !== "string" || !value[key].trim()) errors.push(`${key} debe identificar la ejecución`)
  }
  if (!tasks.some((task) => task.id === value.task_id)) errors.push("task_id no pertenece al catálogo")
  if (!Number.isSafeInteger(value.repetition) || value.repetition < 1) errors.push("repetition debe ser un entero positivo")
  if (!["cold", "reused"].includes(value.context_state)) errors.push("context_state debe ser cold o reused")
  if (!["pass", "fail", "blocked", "incomplete"].includes(value.outcome)) errors.push("outcome debe ser pass, fail, blocked o incomplete; pending no es una observación")
  for (const key of ["duration_seconds", "tool_calls", "retries", "unnecessary_questions", "tokens"]) {
    if (value[key] === null) continue
    if (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] < 0) errors.push(`${key} debe ser un número no negativo o null`)
    else if (key !== "duration_seconds" && !Number.isSafeInteger(value[key])) errors.push(`${key} debe ser un entero seguro o null`)
  }
  if (!Array.isArray(value.evidence) || !value.evidence.length || !value.evidence.every((item) => typeof item === "string" && item.trim())) {
    errors.push("evidence debe contener referencias observadas, también para fallos o bloqueos")
  }
  return errors
}

try {
  if (process.argv.length !== 3) throw new Error("Uso: node validate-result.mjs /ruta/resultado.json")
  const errors = validate(JSON.parse(await readFile(process.argv[2], "utf8")))
  console.log(JSON.stringify({ valid: errors.length === 0, errors }, null, 2))
  if (errors.length) process.exitCode = 1
} catch (error) {
  console.error(JSON.stringify({ valid: false, errors: [error.message] }))
  process.exitCode = 1
}
