export type ErrorCode =
  | "INVALID_ARGUMENT"
  | "INTERACTION_REQUIRED"
  | "INSTALL_CONFLICT"
  | "OPERATION_LOCKED"
  | "STATE_INVALID"
  | "OPERATION_CANCELLED"
  | "OPERATION_FAILED"

export class AppError extends Error {
  readonly code: ErrorCode
  readonly exitCode: number
  readonly details: unknown | undefined

  constructor(code: ErrorCode, message: string, exitCode: number, details?: unknown) {
    super(message)
    this.name = "AppError"
    this.code = code
    this.exitCode = exitCode
    this.details = details
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function aggregateDetails(error: AggregateError): { errors: string[] } {
  return { errors: error.errors.map(errorMessage) }
}

export function normalizeAppError(error: unknown): AppError {
  if (error instanceof AppError) return error

  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : ""
  if (code.startsWith("ERR_PARSE_ARGS_")) {
    return new AppError("INVALID_ARGUMENT", errorMessage(error), 2)
  }
  if (error instanceof AggregateError) {
    return new AppError("OPERATION_FAILED", error.message, 1, aggregateDetails(error))
  }
  return new AppError("OPERATION_FAILED", errorMessage(error), 1)
}

export function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted()
}
