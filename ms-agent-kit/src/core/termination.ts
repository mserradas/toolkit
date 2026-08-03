import { AppError } from "./errors.js"

export type TerminationSignal = "SIGINT" | "SIGTERM"

export interface TerminationController {
  signal: AbortSignal
  abort(signal: TerminationSignal): void
}

function signalExitCode(signal: TerminationSignal): number {
  return signal === "SIGINT" ? 130 : 143
}

export function createTerminationController(): TerminationController {
  const controller = new AbortController()
  return {
    signal: controller.signal,
    abort(signal) {
      if (controller.signal.aborted) return
      controller.abort(
        new AppError(
          "OPERATION_CANCELLED",
          `Operación interrumpida por ${signal}`,
          signalExitCode(signal),
          { signal },
        ),
      )
    },
  }
}
