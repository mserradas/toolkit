---
name: ms-doctor
description: Diagnostica Claude Code, sus agentes ms-*, skills y configuración
agent: ms-architect
---

Eres `ms-architect` ejecutando `/ms-doctor` en Claude Code. Este diagnóstico es de solo lectura.

Argumento: `$ARGUMENTS`

## Reglas

- No edites archivos, crees artefactos, instales dependencias ni invoques subagentes.
- No ejecutes verificaciones del proyecto. Usa solo comandos de lectura y diagnóstico de Claude disponibles.
- Si una validación efectiva no está disponible, distingue claramente inspección estática de carga confirmada.

## Inspección

Revisa solo el contexto Claude Code:

- `~/.claude/settings.json`, `agents/ms-*.md`, `skills/*/SKILL.md`.
- En scope de proyecto, las rutas equivalentes bajo `.claude/` y los `CLAUDE.md` aplicables.

Comprueba que agentes y skills tienen frontmatter válido; `ms-shared` existe una sola vez; `ms-status` y `ms-doctor` apuntan a `ms-architect`; los roles conservan sus responsabilidades de coordinación. El kit omite `tools`, `disallowedTools` y `permissionMode`, y no instala hooks `PreToolUse`. Tampoco instala hooks `Stop` ni configura `maxTurns`.

La ausencia de los antiguos `hooks/ms-agent-guard.mjs` y `hooks/ms-result-validator.mjs` es esperada. Los permisos efectivos dependen de la configuración nativa de Claude; no los infieras de las instrucciones del rol. `unknown` no es una denegación ni obliga a pedir otra aprobación. No ejecutes verificaciones durante doctor.

## Modelos

Lee solo `model` y `effort` del frontmatter del agente afectado y los ajustes aplicables de Claude, indicando sus rutas. Un valor omitido se hereda del cliente. Estos archivos acreditan configuración declarada, no el modelo efectivo de una sesión ni coincidencia con el catálogo del kit. Sin observación nativa real, el efectivo sigue `no comprobado`. Limita la salida a 2048 bytes; no vuelques prompts, configuración completa ni secretos. El kit no fija un presupuesto de turnos. No cambies modelo o esfuerzo ni inicies sesiones para diagnosticar. El diagnóstico funciona sin el instalador del kit ni un comando global.

## Salida

```text
## MS Doctor · Claude Code
Estado general: OK | advertencias | requiere atención

Config: <resumen>
Agentes: <tabla de estructura y permisos>
Skills de Claude Code: <n válidas>/<n instaladas>
Validación del resultado: revisión de evidencia por el padre
Instrucciones del proyecto: <resumen>
Riesgos: <solo riesgos reales>
Acciones recomendadas: <acciones concretas o "ninguna">
```
