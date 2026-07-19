---
name: ms-doctor
description: Diagnostica Claude Code, sus agentes ms-*, skills, hooks y permisos
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

- `~/.claude/settings.json`, `agents/ms-*.md`, `skills/*/SKILL.md` y `hooks/ms-agent-guard.mjs`.
- En scope de proyecto, las rutas equivalentes bajo `.claude/` y los `CLAUDE.md` aplicables.

Comprueba que los agentes y las skills tienen frontmatter válido; `ms-architect` conserva capacidad de coordinación; los workers no pueden subdelegar; los permisos y hooks concuerdan con cada rol; el guard bloquea secretos y escrituras fuera de ownership; `ms-shared` existe una sola vez; y `ms-status`, `ms-continue` y `ms-doctor` apuntan a `ms-architect`. Con argumento `full`, incluye todos los agentes; en otro caso usa los siete mínimos.

No cuentes skills de OpenCode, Codex, cachés ni marketplaces.

## Salida

```text
## MS Doctor · Claude Code
Estado general: OK | advertencias | requiere atención

Config: <resumen>
Agentes: <tabla de estructura y permisos>
Skills de Claude Code: <n válidas>/<n instaladas>
Hooks / guard: <resumen>
Instrucciones del proyecto: <resumen>
Riesgos: <solo riesgos reales>
Acciones recomendadas: <acciones concretas o "ninguna">
```
