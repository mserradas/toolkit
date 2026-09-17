import { constants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import { parseArgs } from "node:util"
import { AppError } from "../core/errors.js"
import { validateResultContract } from "../core/result-contract.js"
import { isSensitivePath } from "../core/permissions.js"

export async function runResultCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, options: { file: { type: "string" }, json: { type: "boolean" } }, allowPositionals: true, strict: true })
  if (positionals.length !== 1 || positionals[0] !== "validate" || !values.file) {
    throw new AppError("INVALID_ARGUMENT", "Uso: pnpm start result validate --file <respuesta.md> [--json]", 2)
  }
  if (isSensitivePath(values.file)) throw new AppError("INVALID_ARGUMENT", "Ruta sensible no permitida", 2)
  const resolved = await realpath(values.file)
  if (isSensitivePath(resolved)) throw new AppError("INVALID_ARGUMENT", "Ruta sensible no permitida", 2)
  const initial = await lstat(values.file)
  if (!initial.isFile()) throw new AppError("INVALID_ARGUMENT", "La respuesta debe ser un archivo regular sin symlink", 2)
  const file = await open(values.file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const info = await file.stat()
    if (!info.isFile() || info.dev !== initial.dev || info.ino !== initial.ino) throw new Error("El archivo de respuesta cambió durante la lectura")
    if (info.size > 262_144) throw new Error("Respuesta demasiado grande")
    const buffer = Buffer.alloc(262_145)
    let offset = 0
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset)
      if (!bytesRead) break
      offset += bytesRead
    }
    if (offset === buffer.length) throw new Error("Respuesta demasiado grande")
    const contract = validateResultContract(buffer.subarray(0, offset).toString("utf8"))
    process.stdout.write(values.json ? `${JSON.stringify({ valid: true, status: contract.status, verificationDeclared: Object.hasOwn(contract, "verification") })}\n` : "Contrato coherente; evidencia y cobertura requieren aceptación del padre.\n")
  } catch (error) {
    throw new AppError("INVALID_ARGUMENT", error instanceof Error ? error.message : "Contrato inválido", 2)
  } finally {
    await file.close()
  }
}
