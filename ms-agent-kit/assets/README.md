# Catálogo incluido

Snapshot creado el 2026-07-13 desde `~/.config/opencode`.

Solo contiene estas superficies portables:

- `agents/ms-*.md`
- `commands/ms-*.md`
- `skills/*/SKILL.md` y sus archivos auxiliares
- `docs/agents-shared.md`
- `docs/agents.md`
- `config/tui.json`
- `config/package.json`
- `config/opencode-notifier.json`

El adaptador genera `opencode.json` con rutas correctas para el scope de destino. No se copian credenciales, cachés, locks, dependencias instaladas ni estado de sesiones/plugins.
Los adaptadores también añaden la política portable de permisos al generar cada plataforma.
