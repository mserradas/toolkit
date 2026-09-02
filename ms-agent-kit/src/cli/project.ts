import path from "node:path"
import process from "node:process"
import { parseArgs } from "node:util"
import { AppError } from "../core/errors.js"
import { initializeProjectContext, inspectProjectContext } from "../core/project-context.js"
import { createTerminationController } from "../core/termination.js"

export async function runProjectCommand(input: string[]): Promise<void> {
  const [command, ...args] = input
  if (command !== "init" && command !== "inspect") throw new AppError("INVALID_ARGUMENT", "Uso: project init|inspect [--project <ruta>] [--json] [--dry-run]", 2)
  const { values } = parseArgs({ args, allowPositionals: false, strict: true, options: {
    project: { type: "string" }, json: { type: "boolean", default: false }, "dry-run": { type: "boolean", default: false },
  } })
  if (command === "inspect" && values["dry-run"]) throw new AppError("INVALID_ARGUMENT", "--dry-run solo es válido para project init", 2)
  const root = path.resolve(values.project ?? process.cwd())
  const termination = createTerminationController()
  const onInterrupt = () => termination.abort("SIGINT")
  const onTerminate = () => termination.abort("SIGTERM")
  if (command === "init") { process.on("SIGINT", onInterrupt); process.on("SIGTERM", onTerminate) }
  try {
    const result = command === "inspect" ? await inspectProjectContext(root) : await initializeProjectContext(root, { dryRun: values["dry-run"], signal: termination.signal })
    process.stdout.write(values.json ? `${JSON.stringify(result, null, 2)}\n` : "status" in result
      ? `Contexto: ${result.status}${result.changedSources.length ? `\nFuentes: ${result.changedSources.join(", ")}` : ""}\n`
      : `${values["dry-run"] ? "Simulación: " : ""}${result.action}: ${result.path}\n`)
  } finally {
    if (command === "init") { process.off("SIGINT", onInterrupt); process.off("SIGTERM", onTerminate) }
  }
}
