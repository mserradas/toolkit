# Estado: endurecimiento multiplataforma de agentes

Fecha del checkpoint: 2026-07-16

## Estado actual

- P1 — configuración inicial de Claude, OpenCode y Codex: completado.
- TDD de referencia: `docs/design/claude-nested-shell-guard-2026-07-15.md`.
- P4 — shells anidados, wrappers, opciones y `env -P`: completado.
- P5 — cuatro hallazgos confirmados (`Grep.glob`, volcado recursivo de entorno, código dinámico y control de shell): completado.
- P6 — código generado en capas interpretadas, prefijos `!`/`time`/`coproc` y modelo inicial de `xargs`: completado y reemplazado en su parte `xargs` por P6.1.
- P6.1 — entrada no confiable de `xargs`, consumidor estático y eliminación del centinela inventado: completado.
- P6.2 — transición inválida de comilla simple dentro de quoting doble: implementación, regresión y revisión de seguridad final completadas.
- Verificación actual de ms-tester: 70/70 pruebas en 11 archivos; Claude guard 13/13; `pnpm check`, `pnpm build` y `git diff --check`: PASS.
- Revisión de seguridad doble de P6.2: juez A `APPROVED` y juez B `APPROVED`, sin hallazgos CRITICAL/WARNING reales; `JUDGMENT: APPROVED`.
- Instalación global final: pendiente.

## Recibos de revisión

- El recibo de P6 confirmó en ambos jueces que el centinela de entrada de `xargs` era *unsound*; queda obsoleto porque P6.1 cambió el diff para corregir la causa compartida.
- Re-juicio de P6.1: juez B `APPROVED`, con una única sugerencia no bloqueante sobre preservar provenance de comillas.
- Re-juicio de P6.1: juez A `CHANGES_REQUIRED`, con dos hallazgos que el juez B no confirmó:
  - `sh -c 'sh -c "'\''$(printf rm)'\'' -f archivo"'`, por posible manejo incorrecto de una comilla simple dentro de comillas dobles en `hasActiveCodeGeneration`;
  - `cp /bin/rm /tmp/printf && printf 'ignored\0' | xargs -0 /tmp/printf archivo`, por confiar en el basename `printf` para el gate de consumidor.
- Ambos hallazgos quedan registrados como contradicciones/sospechas no confirmadas, sin corrección automática.
- Dos revisiones semánticas posteriores confirmaron como real la transición inválida de comilla simple dentro de quoting doble. P6.2 la corrige con una condición en `hasActiveCodeGeneration` y añade dos casos de regresión.
- Ambas revisiones semánticas clasificaron como teórico el riesgo de resolver `printf` por basename/PATH; queda documentado y sin corrección.
- La fase roja de P6.2 obtuvo 1 fallo y 12 casos correctos: el caso peligroso recibió código 0 en vez de 2. Tras la implementación mínima, la verificación focalizada de Claude guard quedó en 13/13.
- El TDD P6.2 está actualizado.
- El recibo de P6.1 queda obsoleto por el nuevo diff.
- Re-juicio final de P6.2: juez A `APPROVED`, con cero hallazgos CRITICAL/WARNING reales.
- Re-juicio final de P6.2: juez B `APPROVED`, con cero hallazgos CRITICAL/WARNING reales.
- Ambos jueces confirman que P6.2 corrige la transición de quoting y no introduce regresiones en P6 ni P6.1.
- Residual compartido: la identidad de `printf` resuelta por basename/PATH permanece como riesgo teórico/informativo, no bloqueante y sin corrección.
- Juicio actual: `JUDGMENT: APPROVED` para el diff P6.2.
- P6 conserva el rechazo *fail-closed* de sustituciones activas y de los prefijos `!`, `time` y `coproc`.
- P6.1 trata la entrada futura de `xargs` como dato no confiable, rechaza fuentes/modos no modelados y solo permite `printf` con formato estático explícito como consumidor determinista.
- Hallazgos sospechosos de un solo juez, no modificados en P6: brace glob y variable en posición de ejecutable.
- La revisión de Reliability detecta que el rollback no restaura exactamente modos y directorios; se considera un hallazgo real no bloqueante.
- Huella del diff versionado a revisar: `git diff --stat: 12 files, 1494 insertions, 99 deletions`; además hay documentos de diseño/estado y `tests/codex-policy.test.ts` sin seguimiento.
- Archivos clave: `src/adapters/claude.ts`, `src/adapters/codex.ts`, `src/adapters/opencode.ts`, `src/core/profiles.ts`, `src/core/files.ts`, `src/cli.ts`, `tests/claude-guard.test.ts`, `tests/adapters.test.ts`, `tests/installer.test.ts`, `README.md`, `assets/commands/ms-doctor.md` y `assets/opencode/config/package.json`.

## Próxima acción

- Ejecutar la instalación global final y `doctor --target all`; la instalación todavía no está completada.
# Cierre operativo final — 2026-07-16

- Estado: **completado**. `JUDGMENT: APPROVED` para P6.2; instalación global terminada y doctor verde. Próxima acción: **stop/cierre**.
- Plan previo: 0 conflictos, 1 actualización y 95 recursos sin cambios.
- Instalación global sin `--force`: exit 0; 1 recurso actualizado y 95 sin cambios.
- Doctor final: `ok: true`; OpenCode 37/37, Claude 30/30 y Codex 29/29; `warnings: []`, `duplicateSkills: []` y política Codex 28/28.
- Plan posterior: 96 recursos sin cambios; 0 creaciones, actualizaciones, eliminaciones, conflictos u otras acciones pendientes.
- OpenCode: modelo `openai/gpt-5.6-sol`, agente predeterminado `ms-architect`, variante del agente `high`, plugin 1.18.2, 13 agentes y 10 skills portables; con skills externas desactivadas no expone skills reservadas `ms-*`.
- Aislamiento persistido para Fish: `OPENCODE_DISABLE_EXTERNAL_SKILLS=1` en `fish_variables`.
- Higiene del sistema: no quedan enlaces simbólicos en los tres roots de skills y `.agents/skills/ms-shared` fue eliminado.
- Riesgos informativos no bloqueantes: permanece el caso teórico de confianza en `basename`/`PATH` y la restauración transaccional no conserva necesariamente con fidelidad exacta los modos o la existencia previa de directorios vacíos.
- Acciones obligatorias pendientes: **ninguna**.
