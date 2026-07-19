import path from "node:path"
import { stripVTControlCharacters } from "node:util"
import { describe, expect, it } from "vitest"
import {
  finishWithoutChanges,
  formatInstallResult,
  plannedChangeCount,
  planNeedsConfirmation,
  promptConfirmation,
  promptInstallOptions,
  showInstallResult,
  showInstallSummary,
  type InteractiveDriver,
  type PlanSummaryCounts,
} from "../src/interactive.js"
import type { InstallScope, Target } from "../src/core/types.js"

const CANCELLED = Symbol("cancelled")
type Answer = Target[] | InstallScope | string | boolean | symbol

function fakeDriver(...answers: Answer[]): {
  driver: InteractiveDriver
  cancelled: string[]
  notes: Array<{ message?: string; title?: string }>
  outros: string[]
  textDefaults: string[]
} {
  const cancelled: string[] = []
  const notes: Array<{ message?: string; title?: string }> = []
  const outros: string[] = []
  const textDefaults: string[] = []
  const next = <T>(): Promise<T> => Promise.resolve(answers.shift() as T)

  return {
    cancelled,
    notes,
    outros,
    textDefaults,
    driver: {
      intro: () => undefined,
      cancel: (message) => cancelled.push(message),
      note: (message, title) => notes.push({
        message: message === undefined ? undefined : stripVTControlCharacters(message),
        title: title === undefined ? undefined : stripVTControlCharacters(title),
      }),
      outro: (message) => outros.push(stripVTControlCharacters(message)),
      isCancel: (value): value is symbol => typeof value === "symbol",
      multiselect: () => next<Target[] | symbol>(),
      select: () => next<InstallScope | symbol>(),
      text: (options) => {
        textDefaults.push(options.initialValue ?? "")
        return next<string | symbol>()
      },
      confirm: () => next<boolean | symbol>(),
    },
  }
}

const emptyCounts = (): PlanSummaryCounts => ({
  create: 0,
  update: 0,
  adopt: 0,
  unchanged: 0,
  conflict: 0,
  remove: 0,
  restore: 0,
  detach: 0,
  skip: 0,
})

describe("interactive installer prompts", () => {
  it("allows any non-empty combination of clients", async () => {
    const { driver } = fakeDriver(["opencode", "codex"], "user")

    await expect(promptInstallOptions("/workspace", driver)).resolves.toEqual({
      targets: ["opencode", "codex"],
      scope: "user",
      projectRoot: path.resolve("/workspace"),
    })
  })

  it("uses cwd as the editable project path default", async () => {
    const { driver, textDefaults } = fakeDriver(["claude"], "project", "./nested")

    await expect(promptInstallOptions("/workspace", driver)).resolves.toEqual({
      targets: ["claude"],
      scope: "project",
      projectRoot: path.resolve("/workspace", "./nested"),
    })
    expect(textDefaults).toEqual(["/workspace"])
  })

  it.each([
    ["target selection", [CANCELLED]],
    ["scope selection", [["opencode"] as Target[], CANCELLED]],
    ["project path", [["opencode"] as Target[], "project", CANCELLED]],
  ])("stops cleanly when cancelling %s", async (_label, answers) => {
    const { driver, cancelled } = fakeDriver(...(answers as Answer[]))

    await expect(promptInstallOptions("/workspace", driver)).resolves.toBeNull()
    expect(cancelled).toEqual(["Instalación cancelada"])
  })

  it.each([true, false])("returns confirmation value %s", async (answer) => {
    const { driver } = fakeDriver(answer)
    await expect(promptConfirmation("Continuar?", driver)).resolves.toBe(answer)
  })

  it("stops cleanly when cancelling a confirmation", async () => {
    const { driver, cancelled } = fakeDriver(CANCELLED)

    await expect(promptConfirmation("Continuar?", driver)).resolves.toBeNull()
    expect(cancelled).toEqual(["Operación cancelada"])
  })

  it("renders the installation summary as a vertical card", () => {
    const { driver, notes } = fakeDriver()

    showInstallSummary(
      {
        targets: ["opencode", "codex"],
        scope: "project",
        homeDir: "/Users/example",
        projectRoot: "/workspace/project",
        statePath: "/workspace/project/.ms-agent-kit/state.json",
        counts: { ...emptyCounts(), create: 3, unchanged: 12 },
      },
      driver,
    )

    expect(notes).toEqual([
      {
        title: "Resumen de instalación",
        message: [
          "Clientes",
          "  ✓ OpenCode",
          "  ✓ Codex",
          "",
          "Destino",
          "  Proyecto",
          "  /workspace/project",
          "",
          "Cambios que se aplicarán",
          "  + Crear · 3",
          "  ✓ Sin conflictos",
          "",
          "Registro",
          "  /workspace/project/.ms-agent-kit/state.json",
        ].join("\n"),
      },
    ])
  })

  it("shows an updated state and shortens home paths when there are no changes", () => {
    const { driver, notes, outros } = fakeDriver()
    const counts = { ...emptyCounts(), unchanged: 96 }

    showInstallSummary(
      {
        targets: ["opencode", "claude", "codex"],
        scope: "user",
        homeDir: "/Users/example",
        projectRoot: "/workspace",
        statePath: "/Users/example/.ms-agent-kit/state.json",
        counts,
      },
      driver,
    )
    finishWithoutChanges(driver)

    expect(planNeedsConfirmation(counts)).toBe(false)
    expect(notes[0]?.message).toContain("Estado\n  ✓ Todo está actualizado\n  96 archivos sin cambios")
    expect(notes[0]?.message).not.toContain("Conflictos")
    expect(notes[0]?.message).toContain("~/.ms-agent-kit/state.json")
    expect(outros).toEqual(["No hay cambios que aplicar"])
  })

  it("renders the final result vertically and hides zero counters", () => {
    const { driver, notes, outros } = fakeDriver()

    showInstallResult(
      {
        created: 6,
        updated: 60,
        adopted: 0,
        unchanged: 36,
        removed: 0,
        restored: 0,
        detached: 0,
        skipped: 0,
        statePath: "/Users/example/.ms-agent-kit/state.json",
      },
      "/Users/example",
      driver,
    )

    expect(notes).toEqual([
      {
        title: "Instalación completada",
        message: [
          "Cambios aplicados",
          "  + Creados · 6",
          "  ↻ Actualizados · 60",
          "",
          "Conservados",
          "  ✓ Sin cambios · 36",
          "",
          "Registro",
          "  ~/.ms-agent-kit/state.json",
        ].join("\n"),
      },
    ])
    expect(notes[0]?.message).not.toContain("Adoptados")
    expect(notes[0]?.message).not.toContain("Omitidos")
    expect(outros).toEqual(["Configuración lista"])
  })

  it("highlights skipped files that require review", () => {
    const { driver, notes } = fakeDriver()

    showInstallResult(
      {
        created: 1,
        updated: 0,
        adopted: 0,
        unchanged: 0,
        removed: 0,
        restored: 0,
        detached: 0,
        skipped: 2,
        statePath: "/workspace/.ms-agent-kit/state.json",
      },
      "/Users/example",
      driver,
    )

    expect(notes[0]?.message).toContain("Requieren revisión\n  ! Omitidos · 2")
  })

  it("uses semantic colors when the terminal supports them", () => {
    const previousForceColor = process.env.FORCE_COLOR
    const previousNoColor = process.env.NO_COLOR
    process.env.FORCE_COLOR = "1"
    delete process.env.NO_COLOR

    try {
      const output = formatInstallResult(
        {
          created: 1,
          updated: 2,
          adopted: 0,
          unchanged: 0,
          removed: 0,
          restored: 0,
          detached: 0,
          skipped: 3,
          statePath: "/workspace/.ms-agent-kit/state.json",
        },
        "/Users/example",
      )

      expect(output).toContain("\u001b[32m+ Creados · 1\u001b[39m")
      expect(output).toContain("\u001b[36m↻ Actualizados · 2\u001b[39m")
      expect(output).toContain("\u001b[33m! Omitidos · 3\u001b[39m")
    } finally {
      if (previousForceColor === undefined) delete process.env.FORCE_COLOR
      else process.env.FORCE_COLOR = previousForceColor
      if (previousNoColor === undefined) delete process.env.NO_COLOR
      else process.env.NO_COLOR = previousNoColor
    }
  })

  it("counts only changes that will actually be applied", () => {
    const counts = { ...emptyCounts(), create: 2, update: 1, skip: 4, unchanged: 10 }

    expect(planNeedsConfirmation(counts)).toBe(true)
    expect(plannedChangeCount(counts)).toBe(3)
  })
})
