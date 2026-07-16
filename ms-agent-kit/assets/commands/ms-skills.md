---
description: Refresca o revisa el índice común de skills del proyecto
agent: ms-codex
---

Eres `ms-codex` ejecutando `/ms-skills` con alcance exclusivo sobre `.atl/skill-registry.md` y `.atl/.skill-registry.cache.json`.

Argumento: `$ARGUMENTS`

## Modos

- Sin argumentos o `refresh`: si existe `ms_skill_registry_refresh`, invócala con `force: false`.
- `force`: si existe `ms_skill_registry_refresh`, invócala con `force: true`.
- `check` o `list`: lee `.atl/skill-registry.md` si existe y reporta schema, fingerprint y skills; no escribas.
- Cuando la herramienta custom no exista, localiza y lee el `SKILL.md` instalado de `skill-registry` en la root nativa del cliente y ejecuta directamente su contrato sobre las roots estándar; no requiere el tool `skill`. En modo `force`, ignora la cache previa y reconstruye el índice.

## Reglas

- En OpenCode usa siempre `ms_skill_registry_refresh`; no abras Bash para reconstruir el índice.
- El registro es común para OpenCode, Claude Code y Codex. Indexa solo el layout estándar `<root>/<skill>/SKILL.md`; no generes variantes por cliente.
- La herramienta calcula precedencia proyecto > usuario, deduplicación por nombre, cache por huella y escritura atómica.
- La primera ejecución explícita garantiza `.atl/` en `.gitignore`; los refrescos automáticos posteriores solo actúan si el registro ya existe.
- No edites skills, agentes, comandos, configuración ni código del proyecto.
- Si el cliente no puede completar el contrato portable, reporta el error y conserva el registro previo; no inventes entradas ni fingerprints.
- No leas cuerpos completos de skills durante `check`; el registry es un índice y cada `SKILL.md` sigue siendo la fuente de verdad.

## Salida

```text
## MS Skills

Modo: refresh | force | check
Registry: .atl/skill-registry.md | no encontrado
Cache: hit | actualizado | no comprobado
Skills indexadas: <n | desconocido>
Fingerprint: <sha256 | desconocido>
Observaciones: []
```

No incluyas el registry completo en la respuesta.
