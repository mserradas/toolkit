# Estado: endurecimiento multiplataforma de agentes

Fecha del checkpoint: 2026-07-15

## Estado actual

- P1 — configuración inicial de Claude, OpenCode y Codex: completado.
- TDD de referencia: `docs/design/claude-nested-shell-guard-2026-07-15.md`.
- P4 — shells anidados, wrappers, opciones y `env -P`: completado.
- P5 — cuatro hallazgos confirmados (`Grep.glob`, volcado recursivo de entorno, código dinámico y control de shell): completado.
- P6 — código generado en capas interpretadas, prefijos `!`/`time`/`coproc` y modelo inicial de `xargs`: completado y reemplazado en su parte `xargs` por P6.1.
- P6.1 — entrada no confiable de `xargs`, consumidor estático y eliminación del centinela inventado: completado.
- Verificación actual: 35/35 pruebas; Claude 13/13; installer 13/13; `pnpm check`, `pnpm build` y `git diff --check`: PASS.
- Revisión doble de P6.1: contradictoria; `JUDGMENT: ESCALATED`.
- Instalación global final: pendiente.

## Recibos de revisión

- El recibo de P6 confirmó en ambos jueces que el centinela de entrada de `xargs` era *unsound*; queda obsoleto porque P6.1 cambió el diff para corregir la causa compartida.
- Re-juicio de P6.1: juez B `APPROVED`, con una única sugerencia no bloqueante sobre preservar provenance de comillas.
- Re-juicio de P6.1: juez A `CHANGES_REQUIRED`, con dos hallazgos que el juez B no confirmó:
  - `sh -c 'sh -c "'\''$(printf rm)'\'' -f archivo"'`, por posible manejo incorrecto de una comilla simple dentro de comillas dobles en `hasActiveCodeGeneration`;
  - `cp /bin/rm /tmp/printf && printf 'ignored\0' | xargs -0 /tmp/printf archivo`, por confiar en el basename `printf` para el gate de consumidor.
- Ambos hallazgos quedan registrados como contradicciones/sospechas no confirmadas, sin corrección automática.
- Juicio actual: `JUDGMENT: ESCALATED`.
- P6 conserva el rechazo *fail-closed* de sustituciones activas y de los prefijos `!`, `time` y `coproc`.
- P6.1 trata la entrada futura de `xargs` como dato no confiable, rechaza fuentes/modos no modelados y solo permite `printf` con formato estático explícito como consumidor determinista.
- Hallazgos sospechosos de un solo juez, no modificados en P6: brace glob y variable en posición de ejecutable.
- La revisión de Reliability detecta que el rollback no restaura exactamente modos y directorios; se considera un hallazgo real no bloqueante.
- Huella del diff versionado a revisar: `git diff --stat: 12 files, 1494 insertions, 99 deletions`; además hay documentos de diseño/estado y `tests/codex-policy.test.ts` sin seguimiento.
- Archivos clave: `src/adapters/claude.ts`, `src/adapters/codex.ts`, `src/adapters/opencode.ts`, `src/core/profiles.ts`, `src/core/files.ts`, `src/cli.ts`, `tests/claude-guard.test.ts`, `tests/adapters.test.ts`, `tests/installer.test.ts`, `README.md`, `assets/commands/ms-doctor.md` y `assets/opencode/config/package.json`.

## Próxima acción

- Pedir autorización para una ronda dirigida de reproducción y, solo si se confirman, corrección de las dos contradicciones de P6.1. Mantener pendiente la instalación global.
