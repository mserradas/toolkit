import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { DEFAULT_ASSETS_ROOT } from "../src/core/catalog.js"
import { parseMarkdown } from "../src/core/frontmatter.js"

describe("ms-architect policy", () => {
  it("counts Codex-managed doctor artifacts using state targets", async () => {
    const doctor = await readFile(
      path.join(DEFAULT_ASSETS_ROOT, "commands", "codex", "ms-doctor.md"),
      "utf8",
    )

    expect(doctor).toContain("cuyo `target` sea `codex` o cuyo array `targets` contenga `codex`")
    expect(doctor).not.toContain("cuyo owner incluya `codex`")
  })

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
      "Security Smoke Gate",
    ]) {
      expect(body).toContain(contract)
    }
    for (const level of ["| 0. Respuesta", "| 1. Fastlane", "| 2. Ejecución simple", "| 3. Paquetes", "| 4. Programa/TDD"]) {
      expect(body).toContain(level)
    }
    expect(body).not.toContain("## Estado MS")
    expect(body).not.toContain("## Retomar MS")
    expect(body).not.toMatch(/ms-progress|ms-continue|\.atl\/status|checkpoint/i)
  })

  it("resolves durable artifacts canonically before delegating", async () => {
    const architect = await readFile(path.join(DEFAULT_ASSETS_ROOT, "agents", "ms-architect.md"), "utf8")
    const projectInit = await readFile(
      path.join(DEFAULT_ASSETS_ROOT, "skills", "ms-project-init", "SKILL.md"),
      "utf8",
    )
    const docs = await readFile(path.join(DEFAULT_ASSETS_ROOT, "docs", "agents.md"), "utf8")

    for (const source of [architect, docs]) {
      for (const canonicalPath of [
        ".agents/docs/discovery",
        ".agents/docs/prd",
        ".agents/docs/spec",
        ".agents/docs/design",
        ".agents/docs/archive",
      ]) {
        expect(source).toContain(canonicalPath)
      }
      expect(source).toContain("ruta explícita del usuario")
      expect(source).toContain("feature slug")
      expect(source).toContain("`mtime`")
      expect(source).toContain("`Borrador`")
      expect(source).toContain("`En revisión`")
      expect(source).toContain("`Archivado`")
      expect(source).toContain("`Reemplazado`")
      expect(source).toContain("drift")
      expect(source).toContain("docs/{discovery,prd,spec,design,archive}")
      expect(source).toContain("`artifact_inputs`")
    }

    expect(architect).toContain("Una ruta explícita del usuario tiene prioridad")
    expect(architect).toContain("si no existe en disco, repórtala como input inválido y bloqueante")
    expect(architect).toContain("Solo cuando el usuario no indicó ruta")
    expect(docs).toContain("sin sustituirla silenciosamente")
    expect(architect).toContain("no elijas por fecha ni `mtime`")
    expect(architect).toContain("No infieras aprobación por la mera existencia")
    expect(architect).toContain("no cargues todo `.agents/docs`")
    expect(architect).toMatch(
      /Resuelve los artefactos durables aplicables[\s\S]*Decide si basta diseño inline o hace falta spec\/TDD[\s\S]*Delega una misión autosuficiente con `artifact_inputs`/,
    )

    for (const snapshotContract of [
      'canonical_root: ".agents/docs"',
      "directories:",
      'discovery: ".agents/docs/discovery"',
      'prd: ".agents/docs/prd"',
      'spec: ".agents/docs/spec"',
      'design: ".agents/docs/design"',
      'archive: ".agents/docs/archive"',
      "active_artifacts:",
      "legacy_paths_detected: []",
      "rutas explícitas o candidatos por feature slug",
      "sin leerlos en bloque ni escribir en ellos",
    ]) {
      expect(projectInit).toContain(snapshotContract)
    }
  })

  it("governs artifact lifecycle without automatic destructive actions", async () => {
    const architect = await readFile(path.join(DEFAULT_ASSETS_ROOT, "agents", "ms-architect.md"), "utf8")
    const discovery = await readFile(path.join(DEFAULT_ASSETS_ROOT, "agents", "ms-discovery.md"), "utf8")
    const plan = await readFile(path.join(DEFAULT_ASSETS_ROOT, "agents", "ms-plan.md"), "utf8")
    const spec = await readFile(path.join(DEFAULT_ASSETS_ROOT, "agents", "ms-spec.md"), "utf8")
    const designer = await readFile(path.join(DEFAULT_ASSETS_ROOT, "agents", "ms-designer.md"), "utf8")
    const status = await readFile(path.join(DEFAULT_ASSETS_ROOT, "commands", "ms-status.md"), "utf8")
    const projectInit = await readFile(
      path.join(DEFAULT_ASSETS_ROOT, "skills", "ms-project-init", "SKILL.md"),
      "utf8",
    )
    const docs = await readFile(path.join(DEFAULT_ASSETS_ROOT, "docs", "agents.md"), "utf8")
    const readme = await readFile(path.join(DEFAULT_ASSETS_ROOT, "..", "README.md"), "utf8")

    for (const disposition of [
      "`mantener activo`",
      "`promover`",
      "`archivar propuesto`",
      "`eliminar propuesto`",
    ]) {
      expect(architect).toContain(disposition)
      expect(docs).toContain(disposition)
    }
    expect(architect).toContain("Archivar, mover o eliminar siempre requiere autorización explícita")
    expect(architect).toContain("no ejecutes ni delegues esa acción sin ella")
    expect(architect).toContain("No abras un subflujo documental para fastlane o nivel 2 claro")
    expect(architect).toContain("como máximo un artefacto activo por tipo + `Feature ID` + `Contexto`")

    for (const source of [discovery, plan, spec, designer]) {
      expect(source).toContain("Última revisión")
      expect(source).toContain("Retención: Activa | Temporal | Histórica")
      expect(source).toContain("Reemplazado por")
      expect(source).toContain("Histórica")
      expect(source).toMatch(/autorización explícita/)
    }
    for (const source of [plan, spec, designer]) {
      expect(source).toContain("Implementado en")
    }
    expect(discovery).toContain("temporal por defecto")
    expect(plan).toContain("mientras la decisión de producto siga vigente")
    expect(spec).toContain("mientras describa comportamiento soportado")
    expect(designer).toContain("Si no hay destino autorizado, conserva un TDD compacto")
    expect(spec).toContain("solo actualizas tu propia spec")
    expect(designer).toContain("actualiza únicamente el TDD propio")

    expect(status).toContain("Artefactos activos:")
    expect(status).toContain("Candidatos de disposición:")
    expect(status).toContain("no decidas ni ejecutes borrados o movimientos")
    expect(status).toContain("si hay más de uno activo por tipo + `Feature ID` + `Contexto`, reporta el conflicto sin elegir")
    expect(projectInit).toContain("`Retención: Histórica`")
    expect(projectInit).toContain("deja esa clave en `null`")
    expect(projectInit).toContain("no elijas por fecha o `mtime`")

    for (const source of [docs, readme]) {
      expect(source).toContain("memoria de trabajo")
      expect(source).toContain("no es una fuente activa ni un vertedero")
      expect(source).toMatch(/motivo de retención/i)
      expect(source).toContain("requiere autorización explícita")
    }
  })

  it("maintains artifact identity, references, drift, and scoped disposal", async () => {
    const architect = await readFile(path.join(DEFAULT_ASSETS_ROOT, "agents", "ms-architect.md"), "utf8")
    const coder = await readFile(path.join(DEFAULT_ASSETS_ROOT, "agents", "ms-codex.md"), "utf8")
    const producers = await Promise.all(
      ["ms-discovery", "ms-plan", "ms-spec", "ms-designer"].map((agent) =>
        readFile(path.join(DEFAULT_ASSETS_ROOT, "agents", `${agent}.md`), "utf8"),
      ),
    )
    const status = await readFile(path.join(DEFAULT_ASSETS_ROOT, "commands", "ms-status.md"), "utf8")
    const projectInit = await readFile(
      path.join(DEFAULT_ASSETS_ROOT, "skills", "ms-project-init", "SKILL.md"),
      "utf8",
    )
    const docs = await readFile(path.join(DEFAULT_ASSETS_ROOT, "docs", "agents.md"), "utf8")
    const readme = await readFile(path.join(DEFAULT_ASSETS_ROOT, "..", "README.md"), "utf8")

    for (const source of producers) {
      expect(source).toContain("Feature ID")
      expect(source).toContain("Contexto: global | branch:<ref> | release:<versión>")
      expect(source).toContain("Revisar cuando")
      expect(source).toContain("Ámbito afectado")
      expect(source).toMatch(/Pausad[ao]/)
      expect(source).toMatch(/Cancelad[ao]|Descartada/)
      expect(source).toContain("ticket o ID explícito")
      expect(source).toContain("slug canónico inicial")
      expect(source).toMatch(/cong[eé]lal[oa]|queda congelado/)
    }
    expect(architect).toContain("tipo + `Feature ID` + `Contexto`")
    expect(architect).toMatch(/[Uu]n cambio de título o slug no cambia ese ID/)
    expect(architect).toContain("usa el ticket o ID explícito si existe")
    expect(architect).toContain("congela el slug canónico inicial")
    expect(architect).toContain("no las combines ni dispongas automáticamente")
    expect(architect).toContain('feature_id: "<id-estable>"')
    expect(architect).toContain('context: "global"')
    expect(architect).toContain("pausar, cancelar, abandonar o reemplazar")
    expect(architect).toContain("`Retención: Temporal` e indica `Revisar cuando`")
    expect(architect).toContain("`review_required: true`")
    expect(architect).toContain("`Reemplazado por` exista, no forme ciclos")
    expect(architect).toContain("una referencia externa se reporta como no verificada")
    expect(architect).toContain("Una promoción no permite retirar el origen")

    for (const step of [
      "Clasifica y propone",
      "Muestra acciones y rutas exactas",
      "una única mutación acotada",
      "Revisa diff y referencias",
    ]) {
      expect(architect).toContain(step)
    }
    expect(architect).toContain("queda invalidada y debe solicitarse de nuevo")
    expect(coder).toContain("Disposición Documental Autorizada")
    expect(coder).toContain("acciones y rutas exactas")
    expect(coder).toContain("detente sin mutar")
    expect(architect).toContain("`handoff_required`")
    expect(architect).toContain("No declares cierre documental completo")

    const artifactInputs = architect.match(/```yaml\nartifact_inputs:\n([\s\S]*?)\n```/)?.[1]
    expect(artifactInputs).toBeDefined()
    for (const key of ["feature_id", "context", "prd", "spec", "design"]) {
      expect(artifactInputs?.match(new RegExp(`^  ${key}:`, "gm"))).toHaveLength(1)
    }

    expect(status).toContain("argumento completo con trim y minúsculas")
    expect(status).toContain("resultado es exactamente `docs` o `maintenance`")
    expect(status).toContain("Un objetivo como `docs-api` conserva el modo focal")
    expect(status).toContain("lista solo cabeceras, metadatos y enlaces")
    expect(status).toContain("temporales sin `Revisar cuando`")
    expect(status).toContain("referencias rotas o cíclicas")
    expect(status).toContain("Handoffs pendientes:")
    expect(status).toContain("nunca escanea todo `.agents/docs`")
    for (const field of ["feature_id: null", 'context: "global"', "review_required: false", "reference_conflicts: []"]) {
      expect(projectInit).toContain(field)
    }
    expect(projectInit).toContain("Marca `review_required: true`")
    expect(projectInit).toContain("No hagas un escaneo global")

    for (const source of [docs, readme]) {
      expect(source).toContain("Casos de mantenimiento")
      expect(source).toContain("`handoff_required`")
      expect(source).toContain("`/ms-status maintenance`")
      expect(source).toContain("cualquier cambio relevante invalida la autorización")
      expect(source).toContain("ticket o ID explícito")
      expect(source).toContain("slug canónico inicial")
      expect(source).toContain("`docs-api`")
    }
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

  it("assigns plan cadence, bounded retries, and one verification owner", async () => {
    const architect = await readFile(path.join(DEFAULT_ASSETS_ROOT, "agents", "ms-architect.md"), "utf8")
    const brief = await readFile(path.join(DEFAULT_ASSETS_ROOT, "skills", "delegation-brief", "SKILL.md"), "utf8")
    const docs = await readFile(path.join(DEFAULT_ASSETS_ROOT, "docs", "agents.md"), "utf8")
    const readme = await readFile(path.join(DEFAULT_ASSETS_ROOT, "..", "README.md"), "utf8")

    for (const policy of [
      "Solo tú mantienes el plan/TODO",
      "Créalo al inicio",
      "actualízalo únicamente",
      "ciérralo al aceptar",
      "8–12 ciclos",
      "Al primer agotamiento",
      "un único `verification_owner`",
      "no hubo escrituras ni cambio de workspace",
      "invalida solo los gates afectados",
    ]) {
      expect(architect).toContain(policy)
    }
    for (const field of ["Evidencia existente:", "Estado del workspace:", "verification_owner:", "Delta pendiente:", "No repetir:"]) {
      expect(brief).toContain(field)
    }
    for (const source of [architect, brief, docs, readme]) {
      expect(source).toContain("implementer | ms-tester | none")
      expect(source).toContain("`ms-codex` o `ms-fastlane`")
      expect(source).toContain("gate independiente pendiente")
      expect(source).toContain("sin ejecución verificable")
      expect(source).not.toContain("verification_owner: ms-codex | ms-tester")
    }
    expect(brief).toContain("Nunca reenvíes el brief original sin cambios")
  })

  it("keeps tester gates compatible with reusable PASS evidence", async () => {
    const tester = await readFile(path.join(DEFAULT_ASSETS_ROOT, "agents", "ms-tester.md"), "utf8")
    const docs = await readFile(path.join(DEFAULT_ASSETS_ROOT, "docs", "agents.md"), "utf8")

    expect(tester).toContain("solo cuando cubran exactamente los gates pendientes")
    expect(tester).toContain("no exista ningún PASS vigente reutilizable dentro de su cobertura")
    expect(tester).toContain("PASS vigentes, ejecutados en esta misión o reutilizados")
    expect(docs).toContain("solo si cubre exactamente los gates pendientes")
    expect(docs).toContain("cobertura vigente ejecutada o reutilizada")
  })

  it("keeps primary handoffs under user control and contracts worker-only", async () => {
    const shared = await readFile(
      path.join(DEFAULT_ASSETS_ROOT, "docs", "agents-shared.md"),
      "utf8",
    )
    const plan = await readFile(path.join(DEFAULT_ASSETS_ROOT, "agents", "ms-plan.md"), "utf8")
    const discovery = await readFile(
      path.join(DEFAULT_ASSETS_ROOT, "agents", "ms-discovery.md"),
      "utf8",
    )
    const docs = await readFile(path.join(DEFAULT_ASSETS_ROOT, "docs", "agents.md"), "utf8")

    expect(shared).toContain("aplican exclusivamente a workers o subagentes")
    expect(shared).toContain("entregan directamente al usuario")
    expect(shared).toContain("no emiten `Contrato para ms-architect`")
    expect(shared).toContain("no esperan aceptación de `ms-architect`")
    expect(plan).toContain("Tras aprobar el PRD, el usuario decide e inicia el paso a `ms-architect`")
    expect(plan).toContain("no invoca al arquitecto ni espera su aceptación")
    expect(discovery).toContain("El usuario controla y, si lo desea, inicia el paso a `ms-plan`")
    expect(discovery).toContain("No invoques `ms-plan`")
    expect(docs).toContain("el usuario decide/inicia ms-plan")
    expect(docs).toContain("el usuario decide/inicia ms-architect")
  })

  it("routes operational work and documents audited timeout fallbacks", async () => {
    const architect = await readFile(path.join(DEFAULT_ASSETS_ROOT, "agents", "ms-architect.md"), "utf8")
    const coder = await readFile(path.join(DEFAULT_ASSETS_ROOT, "agents", "ms-codex.md"), "utf8")
    const tester = await readFile(path.join(DEFAULT_ASSETS_ROOT, "agents", "ms-tester.md"), "utf8")
    const docs = await readFile(path.join(DEFAULT_ASSETS_ROOT, "docs", "agents.md"), "utf8")

    for (const policy of [
      "diagnóstico operativo de solo lectura sobre procesos, contenedores, servicios o CI",
      "Tests/lint/typecheck/build",
      "Operación mutante explícitamente autorizada por el usuario",
      "No pruebes primero comandos operativos bloqueados por tu rol",
    ]) {
      expect(architect).toContain(policy)
    }
    expect(tester).toContain("repositorio documente explícitamente, aunque sea mayor")
    expect(tester).toContain("300 segundos para comandos focales")
    expect(tester).toContain("900 segundos para suites completas")
    expect(tester).not.toContain("1800")
    expect(coder).toContain("una sola operación de shell por llamada")
    for (const forbiddenGrouping of ["`&`", "`&&`", "`;`", "pipes (`|`)", "shells envolventes"]) {
      expect(coder).toContain(forbiddenGrouping)
    }
    expect(coder).toContain("sustitución de comandos con `$()` o backticks")
    expect(coder).toContain("sustitución de procesos con `<()` o `>()`")
    expect(coder).toContain("redirecciones shell con `<` o `>`")
    expect(coder).toContain("comandos multilínea")
    expect(coder).toContain("timeout documentado por el repositorio")
    expect(coder).toContain("300 segundos a cada comando focal")
    expect(coder).toContain("900 segundos a una suite completa")
    expect(coder).toContain("no lo reintentes automáticamente")
    expect(docs).toContain("diagnóstico operativo de solo lectura")
    expect(docs).toContain("una sola operación de shell por llamada")
    expect(docs).toContain("Sus permisos Bash bloquean la composición")
    expect(docs).toContain("sustitución de comandos con `$()` o backticks")
    expect(docs).toContain("sustitución de procesos con `<()` o `>()`")
    expect(docs).toContain("redirecciones shell con `<` o `>`")
    expect(docs).toContain("comandos multilínea")
    expect(docs).toContain("no se reintenta automáticamente")
    expect(docs).toContain("300 segundos para comandos focales")
    expect(docs).toContain("900 segundos para la suite completa")
  })

  it("summarizes the narrowed OpenCode read and verification permissions", async () => {
    const debuggerPrompt = await readFile(
      path.join(DEFAULT_ASSETS_ROOT, "agents", "ms-debugger.md"),
      "utf8",
    )
    const docs = await readFile(path.join(DEFAULT_ASSETS_ROOT, "docs", "agents.md"), "utf8")

    expect(docs).toContain("`find` no forma parte de este permiso genérico")
    expect(docs).toContain("`git branch --show-current`")
    expect(docs).toContain("`git branch --list`")
    expect(docs).not.toContain("`git branch --list*`")
    expect(docs).toContain("`ms-spec` y `ms-designer` solo reciben `git status` y `git diff` exactos")
    for (const candidate of [
      "`pnpm build`",
      "`pnpm run build`",
      "`pnpm build:staging`",
      "`pnpm run build:staging`",
      "`pnpm exec ng build --configuration development`",
      "`pnpm exec ng test`",
      "Prettier con `--check`",
      "`alembic heads`/`alembic history`",
    ]) {
      expect(docs).toContain(candidate)
    }
    expect(debuggerPrompt).toContain("comandos desconocidos quedan bloqueados por el fallback `deny`")
    expect(debuggerPrompt).toContain("no entran en `ask`")
    expect(debuggerPrompt).not.toContain("Cualquier otro comando entra en `ask`")
    expect(docs).toContain('conserva `"*": "deny"` como fallback')
    expect(docs).toContain("Kubernetes `get`/`describe`/`logs`")
    expect(docs).toContain("`git push`, `ssh`, `scp`, `nc`, Netcat")
    expect(docs).toContain("están en `deny`")
    expect(docs).not.toContain("publicación/red (`git push`, `ssh`, `scp`, `nc`)")
    expect(docs).not.toContain("`find`, `tree`")
  })

  it("documents the seven general skills", async () => {
    const readme = await readFile(path.join(DEFAULT_ASSETS_ROOT, "..", "README.md"), "utf8")

    expect(readme).toContain("7 `skills` generales")
    expect(readme).not.toContain("9 `skills` generales")
  })

  it("keeps balanced capabilities role-scoped and user questions primary-only", async () => {
    const docs = await readFile(path.join(DEFAULT_ASSETS_ROOT, "docs", "agents.md"), "utf8")

    expect(docs).toContain("cada agente conserva `skill` y `lsp` según el permiso estrecho de su rol")
    expect(docs).toContain("Los subagentes devuelven `needs_user_input` y no preguntan directamente.")
    expect(docs).not.toContain("todos los agentes pueden cargar las `skills` instaladas")
    expect(docs).not.toContain("no preguntan directamente salvo invocación directa")
  })

  it("requires Spanish documentation while preserving technical literals", async () => {
    const shared = await readFile(
      path.join(DEFAULT_ASSETS_ROOT, "docs", "agents-shared.md"),
      "utf8",
    )
    const cognitive = await readFile(
      path.join(DEFAULT_ASSETS_ROOT, "skills", "cognitive-doc-design", "SKILL.md"),
      "utf8",
    )
    const docs = await readFile(path.join(DEFAULT_ASSETS_ROOT, "docs", "agents.md"), "utf8")
    const readme = await readFile(path.join(DEFAULT_ASSETS_ROOT, "..", "README.md"), "utf8")
    const contradictoryLanguageRules =
      /idioma del repositorio|idioma del repo|inglés técnico por defecto|adopta el idioma del proyecto/i

    for (const policy of [
      "Toda prosa humana de documentación",
      "títulos, encabezados, etiquetas de metadatos",
      "Conserva sin traducir identificadores",
      "slugs y filenames",
      "normaliza al español toda la prosa humana",
      "No traduzcas citas ni contratos públicos literales",
      "terminología técnica consolidada o canónica",
      "tokens estructurales exigidos por formatos o tooling",
    ]) {
      expect(shared).toContain(policy)
    }

    for (const agent of ["ms-plan", "ms-discovery", "ms-spec", "ms-designer", "ms-writer"]) {
      const source = await readFile(
        path.join(DEFAULT_ASSETS_ROOT, "agents", `${agent}.md`),
        "utf8",
      )
      expect(source).toContain("Toda la prosa humana")
      expect(source).toContain("normaliza al español toda")
      expect(source).toContain("sin traducir")
      expect(source).not.toMatch(contradictoryLanguageRules)
    }

    expect(cognitive).toContain("Escribe toda la prosa humana en español neutro y profesional")
    expect(cognitive).toContain("normaliza al español toda su prosa humana")
    expect(cognitive).toContain("terminología técnica canónica del proyecto")
    expect(cognitive).toContain("happy path")
    expect(cognitive).toContain("Troubleshooting")
    expect(cognitive).not.toMatch(contradictoryLanguageRules)
    expect(shared).not.toMatch(contradictoryLanguageRules)
    for (const source of [docs, readme]) {
      expect(source).toContain("`## Functional summary`")
      expect(source).toContain("`## Resumen funcional`")
      expect(source).toContain("Estado: Aprobada")
      expect(source).toContain("`selected_status`")
      expect(source).toContain("`POST /submissions`")
      expect(source).toContain("`completed`")
      for (const technicalTerm of [
        "`feature`",
        "`runtime`",
        "`schema`",
        "`endpoint`",
        "`benchmark`",
        "`[Unreleased]`",
        "`Added`",
      ]) {
        expect(source).toContain(technicalTerm)
      }
      expect(source).not.toMatch(contradictoryLanguageRules)
    }

    const plan = await readFile(path.join(DEFAULT_ASSETS_ROOT, "agents", "ms-plan.md"), "utf8")
    const discovery = await readFile(
      path.join(DEFAULT_ASSETS_ROOT, "agents", "ms-discovery.md"),
      "utf8",
    )
    const writer = await readFile(path.join(DEFAULT_ASSETS_ROOT, "agents", "ms-writer.md"), "utf8")
    for (const technicalTerm of ["feature", "runtime", "schemas", "endpoints", "benchmarks"]) {
      expect(`${plan}\n${discovery}`).toContain(technicalTerm)
    }
    expect(plan).toContain("documentación pública en `docs/`")
    expect(plan).toContain("PRDs previos en `.agents/docs/prd/`")
    expect(writer).toContain("## [Unreleased]")
    expect(writer).toContain("### Added")
  })

  it("keeps worker loops focal and reports reusable evidence", async () => {
    const agentPolicies = {
      "ms-codex": [
        "No mantienes planes ni TODOs",
        "rangos antes que dumps completos",
        "Agrupa lecturas independientes",
        "parches coherentes",
        "diff antes de releer archivos completos",
        "inner loop",
        "una sola operación de shell por llamada",
        "bloqueadas por los permisos Bash del rol",
        "sustitución de comandos con `$()` o backticks",
        "sustitución de procesos con `<()` o `>()`",
        "redirecciones shell con `<` o `>`",
        "comandos multilínea",
        "timeout documentado por el repositorio",
        "no lo reintentes automáticamente",
        "un único `git diff --check`",
        "sin ejecutar el gate global",
        "éxito compacto",
      ],
      "ms-tester": [
        "No mantienes planes ni TODOs",
        "ejecutas únicamente los huecos",
        "gates nativos agregados",
        "gates en paralelo solo cuando sean aislados",
        "Un PASS conserva comando, resumen, duración y warnings relevantes",
        "salida exitosa debe ocupar `<=4 KB`",
        "PASS reutilizados:",
        "un FAIL añade solo los bloques relevantes",
        "no persistas logs completos",
        "`TIMEOUT`",
        "No reintentes automáticamente",
      ],
      "ms-scout": [
        "No mantienes planes ni TODOs",
        "`ruta:símbolo` o `ruta:rango`",
        "No releas el mismo rango o contenido",
        "reutiliza la conclusión ya respaldada",
        "Puedes leer otros rangos cuando exista un hueco real",
      ],
      "ms-fastlane": [
        "No mantienes planes ni TODOs",
        "8–12 ciclos",
        "agrupa lecturas independientes",
        "parche mínimo coherente",
        "evidencia decisiva",
      ],
    } as const

    for (const [agent, policies] of Object.entries(agentPolicies)) {
      const source = await readFile(path.join(DEFAULT_ASSETS_ROOT, "agents", `${agent}.md`), "utf8")
      for (const policy of policies) expect(source).toContain(policy)
      expect(source).not.toContain("Capturar salida completa")
    }
  })
})
