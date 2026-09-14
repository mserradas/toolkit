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

Comprueba que los agentes y las skills tienen frontmatter válido; `ms-architect` conserva capacidad de coordinación; los workers no pueden subdelegar; los permisos y hooks concuerdan con cada rol; el guard bloquea secretos y escrituras fuera de ownership; `ms-shared` existe una sola vez; y `ms-status` y `ms-doctor` apuntan a `ms-architect`. Con argumento `full`, incluye todos los agentes; en otro caso usa los siete mínimos.

Contrasta el perfil de comandos elegido (`balanced`, `strict` o `trusted`) sin asumir `balanced`. Las autorizaciones personales de verificación solo se materializan para la raíz exacta en scope de proyecto; no conceden `Edit`/`Write` al tester. Separa política, efectos y runtime: un guard no acredita aislamiento de subprocesos, y `unknown` no es una denegación ni obliga a pedir otra aprobación. No ejecutes verificaciones para resolverlo durante doctor.

No cuentes skills de OpenCode, Codex, cachés ni marketplaces.

## Modelos y presupuesto

Consulta `ms-agent-kit doctor --target claude --scope user --json` (usa `--scope project` en ese alcance) con una proyección en la misma llamada de solo la fila de `modelConfiguration` del rol afectado: `role`, `declared`, `installed` y `effective`, incluidas sus fuentes; limita la salida a 2048 bytes y marca `no comprobado` si no cabe. No vuelques prompts, configuración completa ni secretos. El valor declarado incorpora overrides personales; el instalado requiere hashes administrados coincidentes y no acredita el efectivo de una sesión. Sin observación nativa real, el efectivo sigue `no comprobado`. Registra `maxTurns` como presupuesto propio de Claude; no lo equipares a `steps` de OpenCode ni a una instrucción de Codex. No cambies modelo o esfuerzo ni inicies sesiones para diagnosticar.

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
