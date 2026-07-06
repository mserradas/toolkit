# AI Tools

Repositorio compartido para configuraciones de herramientas de IA. Actualmente instala configuracion global de OpenCode y mantiene un sistema de agentes especializado para discovery, producto, arquitectura, implementacion, verificacion, auditoria y documentacion.

El objetivo es que cualquier persona del equipo pueda clonar este repo en su propia maquina y ejecutar `setup.sh` sin tocar rutas hardcodeadas de otro usuario.

## Estructura

| Ruta | Responsabilidad |
| --- | --- |
| `setup.sh` | Instalador interactivo de configuraciones compartidas. |
| `opencode/opencode.json` | Configuracion global de OpenCode que se enlaza a `$HOME/.config/opencode/opencode.json`. |
| `opencode/agents/` | Agentes y subagentes cargados por OpenCode. |
| `opencode/commands/` | Comandos slash de OpenCode para el workflow `ms-*`. |
| `opencode/docs/agents-shared.md` | Runtime compartido cargado por `instructions` en OpenCode. |
| `opencode/docs/agents.md` | Documentacion humana extendida del sistema de agentes. |
| `opencode/plugins/` | Plugins locales de OpenCode. |
| `opencode/skills/` | Skills globales disponibles para agentes OpenCode con `skill: allow`. |
| `opencode/opencode-notifier.json` | Configuracion del plugin de notificaciones, si se usa. |
| `opencode/tui.json` | Configuracion de TUI de OpenCode. |
| `opencode/package.json` | Dependencias de desarrollo/runtime para plugins locales de OpenCode. |
| `skills/` | Skills reutilizables para clientes compatibles con formato `SKILL.md`. |

## Instalacion Rapida

Desde la carpeta `ai-tools`:

```bash
./setup.sh
```

Tambien puedes ejecutarlo desde la raiz de este repo:

```bash
./ai-tools/setup.sh
```

O instalar OpenCode directamente sin pasar por el selector:

```bash
./setup.sh opencode
# desde la raiz del repo:
./ai-tools/setup.sh opencode
```

Para ver ayuda:

```bash
./setup.sh --help
```

Reinicia OpenCode despues de instalar o cambiar cualquier archivo de configuracion. OpenCode carga la configuracion al arrancar y no la recarga en caliente.

## Setup Tecnico

`setup.sh` instala configuraciones mediante symlinks relativos. No copia archivos de configuracion. Esto permite actualizar el repo y que OpenCode use los cambios sin repetir la instalacion, siempre que los enlaces sigan apuntando al repo.

Si existe `opencode/package.json`, el instalador tambien ofrece instalar dependencias npm en `$HOME/.config/opencode/node_modules`. Ese directorio es local y no se versiona; lo necesitan los plugins locales de OpenCode.

Proveedor disponible:

| Proveedor | Destino local |
| --- | --- |
| OpenCode | `$HOME/.config/opencode` |

Enlaces creados para OpenCode:

| Link destino | Origen en este repo |
| --- | --- |
| `$HOME/.config/opencode/opencode.json` | `opencode/opencode.json` |
| `$HOME/.config/opencode/agents` | `opencode/agents` |
| `$HOME/.config/opencode/commands` | `opencode/commands`, si existe |
| `$HOME/.config/opencode/docs` | `opencode/docs` |
| `$HOME/.config/opencode/plugins` | `opencode/plugins`, si existe |
| `$HOME/.config/opencode/skills` | `opencode/skills`, si existe |
| `$HOME/.config/opencode/tui.json` | `opencode/tui.json`, si existe |
| `$HOME/.config/opencode/opencode-notifier.json` | `opencode/opencode-notifier.json`, si existe |
| `$HOME/.config/opencode/package.json` | `opencode/package.json`, si existe |
| `$HOME/.config/opencode/package-lock.json` | `opencode/package-lock.json`, si existe |

El instalador tambien enlaza estos recursos opcionales cuando existan en `opencode/`: `modes/`, `tools/`, `themes/` y `AGENTS.md`.

La carpeta raiz `skills/` se excluye a proposito. Es un catalogo reutilizable por proyecto y no se instala en la configuracion global de OpenCode. Los skills globales de OpenCode viven en `opencode/skills/` y si existen se enlazan a `$HOME/.config/opencode/skills`.

Flujo interno del script:

1. Valida comandos requeridos: `date`, `dirname`, `ln`, `mkdir`, `mv`, `python3`, `tr`, `pwd`.
2. Si no recibe argumento, muestra un selector de proveedor: `OpenCode`, `Todos` o `Salir`.
3. Resuelve la raiz del repo desde la ubicacion real de `setup.sh`.
4. Calcula el destino usando `$HOME/.config/opencode`.
5. Verifica que existan `opencode/agents`, `opencode/docs` y `opencode/opencode.json`.
6. Valida que los JSON instalables sean validos.
7. Muestra un resumen de origen, destino y enlaces que va a crear.
8. Pide confirmacion antes de instalar.
9. Crea `$HOME/.config/opencode` si no existe.
10. Crea symlinks relativos desde el destino fisico hacia este repo.
11. Si hay `opencode/package.json`, ofrece ejecutar `npm ci --ignore-scripts` cuando existe lockfile, o `npm install --ignore-scripts` si no existe.

Comportamiento seguro ante archivos existentes:

- Si el destino ya apunta al origen correcto, no hace nada y lo marca como correcto.
- Si existe un archivo, carpeta o symlink distinto, pide confirmacion antes de reemplazarlo.
- Si confirmas reemplazo, no borra el destino original: lo mueve a `*.backup.YYYYMMDDHHMMSS`.
- Si no confirmas, omite ese enlace y continua con los demas.

## Configuracion De OpenCode

La configuracion principal vive en `opencode/opencode.json`.

Valores actuales importantes:

| Campo | Valor | Proposito |
| --- | --- | --- |
| `model` | `openai/gpt-5.5` | Modelo principal. |
| `default_agent` | `ms-architect` | Agente primario por defecto. |
| `enabled_providers` | `openai` | Limita proveedores habilitados a OpenAI. |
| `permission` | denylist de secretos y credenciales | Bloquea lecturas/comandos habituales contra `.env`, credenciales, llaves y secretos locales. |
| `instructions` | `./docs/agents-shared.md` | Runtime compartido de agentes, relativo al config enlazado. |
| `plugin` | `@warp-dot-dev/opencode-warp`, `@mohak34/opencode-notifier@0.2.8` | Plugins cargados por OpenCode. |

La ruta de `instructions` es relativa para evitar usuarios hardcodeados. Cuando el config esta enlazado en `$HOME/.config/opencode/opencode.json`, `./docs/agents-shared.md` resuelve contra `$HOME/.config/opencode/docs/agents-shared.md`, que tambien es un symlink hacia este repo.

## Sistema De Agentes

OpenCode carga los agentes desde `$HOME/.config/opencode/agents`, que queda enlazado a `opencode/agents`.

Principios del sistema:

- `ms-architect` es el orquestador tecnico por defecto y no edita archivos.
- Los subagentes tienen scopes cerrados y permisos limitados por archivo, comando o herramienta.
- Los agentes read-only no modifican archivos ni ejecutan comandos con efectos secundarios.
- Todo subagente orquestado termina con `Contract for ms-architect`, definido en `opencode/docs/agents-shared.md`.
- El exito no se infiere desde prosa libre: se acepta por contrato, evidencia y ausencia de bloqueos reales.

Flujo base recomendado:

```text
Idea temprana -> ms-discovery -> experimentos / decision de PRD
Idea lista -> ms-plan -> PRD
PRD aprobado -> ms-architect -> ms-spec -> ms-designer -> TDD
Cambio pequeno -> ms-architect -> ms-fastlane -> verificacion / cierre
TDD aprobado -> ms-architect -> ms-codex / ms-tester / ms-scout / auditorias -> ms-progress -> cierre
Bug sin causa raiz -> ms-architect -> ms-debugger -> ms-codex -> ms-tester
```

## Mapa De Agentes

| Agente | Modo | Modelo | Responsabilidad | Puede escribir |
| --- | --- | --- | --- | --- |
| `ms-architect` | `primary` | `openai/gpt-5.5` | Orquestador tecnico. Clasifica, cuestiona, decide fastlane/TDD, delega subagentes, revisa contratos y cierra con evidencia. | No. |
| `ms-plan` | `primary` | `openai/gpt-5.5` | Product Manager tecnico. Crea PRDs accionables: que construir, para quien, por que y con que metricas. | Solo `docs/prd/**`. |
| `ms-discovery` | `primary` | `openai/gpt-5.5` | Estratega de discovery. Debate ideas tempranas, clasifica inconvenientes, supuestos, riesgos y experimentos. | Solo `docs/discovery/**` si el usuario pide guardar. |
| `ms-spec` | `subagent` | `openai/gpt-5.5` | Especificador funcional. Convierte una peticion aprobada o ambigua en una spec verificable de comportamiento, alcance, criterios y contratos. | Solo `docs/spec/**`. |
| `ms-designer` | `subagent` | `openai/gpt-5.5` | Arquitecto documentador. Traduce PRDs aprobados a TDDs accionables y persistentes. | Solo `docs/design/**`. |
| `ms-progress` | `subagent` | `openai/gpt-5.5` | Registrador operativo. Mantiene un ledger de progreso, bloqueos, evidencia, verificacion y siguiente accion. | Solo `docs/status/**`. |
| `ms-fastlane` | `subagent` | `openai/gpt-5.5` | Ejecuta cambios pequenos, claros y seguros sin TDD ni cadena completa de subagentes. | Si, scope limitado. |
| `ms-codex` | `subagent` | `openai/gpt-5.5` | Ejecutor de codigo. Implementa una especificacion cerrada entregada por `ms-architect`. | Si. |
| `ms-tester` | `subagent` | `openai/gpt-5.5-fast` | Ejecutor de verificacion. Corre tests, linters, type-checks y format-checkers. | No. |
| `ms-scout` | `subagent` | `openai/gpt-5.5-fast` | Explorador read-only. Mapea modulos, calcula blast radius y hace review independiente de diffs. | No. |
| `ms-debugger` | `subagent` | `openai/gpt-5.5` | Investigador de bugs read-only. Reproduce, captura logs, aisla causa raiz y reporta. | No. |
| `ms-writer` | `subagent` | `openai/gpt-5.5-fast` | Escritor de documentacion para consumidores: README, changelog, guias, API docs y release notes. | Solo docs de usuario permitidas. |
| `ms-security-auditor` | `subagent` | `openai/gpt-5.5` | Auditor de seguridad read-only. Revisa auth, autz, crypto, secretos, inyecciones, deps, IAM e infra expuesta. | No. |

## Cuando Usar Cada Agente

| Situacion | Agente recomendado |
| --- | --- |
| La idea aun es vaga o hay que validar oportunidad | `ms-discovery` |
| Hay que definir producto antes de tecnica | `ms-plan` |
| Hay que modificar el repo o coordinar ejecucion | `ms-architect` |
| Hay que aclarar comportamiento funcional, criterios o contratos antes del diseno | `ms-spec` |
| Hay un PRD aprobado y hace falta diseno tecnico persistente | `ms-designer` |
| Hay que registrar avance persistente de un cambio nivel 3-4 | `ms-progress` |
| Cambio trivial, claro, de bajo riesgo y pequeno | `ms-fastlane` |
| Implementacion con scope cerrado | `ms-codex` |
| Verificar tests, lint, tipos o formato | `ms-tester` |
| Entender un modulo, buscar impacto o revisar un diff grande | `ms-scout` |
| Bug sin causa raiz confirmada | `ms-debugger` |
| Documentacion visible para usuario o consumidor | `ms-writer` |
| Cambio toca seguridad, auth, secretos, datos sensibles o infra expuesta | `ms-security-auditor` |

## Guardrails Operativos

| Area | Regla |
| --- | --- |
| Orquestacion | Solo `ms-architect` coordina subagentes en el flujo tecnico. |
| Edicion | `ms-architect`, `ms-scout`, `ms-debugger`, `ms-tester` y `ms-security-auditor` son read-only. |
| Producto | `ms-plan` no disena implementacion; solo define PRD. |
| Spec | `ms-spec` no disena arquitectura tecnica profunda ni implementa; solo define comportamiento verificable. |
| Diseno | `ms-designer` no asigna ejecutores; solo produce TDD. |
| Progreso | `ms-progress` no decide ni ejecuta trabajo; solo registra evidencia aceptada. |
| Implementacion | `ms-codex` no redisena, no amplia alcance y no agrega dependencias sin instruccion explicita. |
| Fastlane | `ms-fastlane` se bloquea si el cambio supera el scope pequeno o toca seguridad, datos, infra, contratos publicos o dependencias. |
| Verificacion | `ms-tester` no arregla fallos ni instala dependencias; reporta resultados. |
| Seguridad | `ms-security-auditor` reporta hallazgos con evidencia; no escribe fixes. |
| Contratos | Todo subagente orquestado termina con `Contract for ms-architect`. |

## Runtime Compartido

`opencode/docs/agents-shared.md` contiene las instrucciones compartidas que OpenCode carga en runtime.

Incluye:

- Reglas globales contra inventar contexto, resultados o decisiones previas.
- Regla de no usar subagentes desde agentes con `task: deny`.
- Definicion del contrato YAML `Contract for ms-architect`.
- Criterios de `Fast Accept` para que `ms-architect` acepte resultados sin reinterpretar todo desde cero.

`opencode/docs/agents.md` es documentacion humana mas extensa. Si cambias el contrato operativo, actualiza primero `agents-shared.md` y despues la documentacion humana.

## Skills De OpenCode

Estos skills se instalan globalmente para OpenCode desde `opencode/skills/`.

| Skill | Descripcion |
| --- | --- |
| `chained-pr` | Divide cambios grandes en PRs encadenados o stacked PRs. |
| `cognitive-doc-design` | Disena documentacion clara y de baja carga cognitiva. |
| `comment-writer` | Escribe comentarios concisos de colaboracion. |
| `delegation-brief` | Prepara briefs autosuficientes para subagentes. |
| `judgment-day` | Ejecuta revision adversarial con doble juez ciego. |
| `skill-creator` | Crea skills concisas y LLM-first. |
| `skill-improver` | Audita y mejora skills existentes. |
| `work-unit-commits` | Planifica cambios como unidades revisables. |

## Skills Del Repo

Estos skills viven en la carpeta raiz `skills/` para reutilizacion futura o integracion directa por proyecto. No se instalan con `setup.sh`.

| Skill | Descripcion |
| --- | --- |
| `angular-21` | Guia para escribir UI en Angular v21. |
| `create-tech-plan` | Genera planes tecnicos ejecutables con fases, validaciones y DoD. |
| `primeng-21` | Guia para PrimeNG 21. |
| `react-19` | Guia para escribir UI en React 19. |
| `tailwind-4` | Guia para Tailwind CSS 4. |
| `typescript` | Patrones y buenas practicas de TypeScript strict. |

## Agregar Nuevos Proveedores

Para extender `setup.sh` con otro proveedor:

1. Crea una carpeta del proveedor en este repo.
2. Agrega una funcion `install_<proveedor>` que valide origen, prepare destino y cree enlaces.
3. Registra el proveedor en `select_provider`.
4. Registra la etiqueta en `provider_label`.
5. Registra la ejecucion en `install_provider`.
6. Actualiza la tabla de proveedores y enlaces en este README.

Mantener estas reglas:

- No hardcodear usuarios ni rutas absolutas de una maquina personal.
- Usar `$HOME` para destinos globales por usuario.
- Preferir symlinks relativos para que el repo pueda moverse junto con el workspace.
- Pedir confirmacion antes de reemplazar destinos existentes.
- Hacer backup con `mv`, no borrar con `rm -rf`.

## Troubleshooting

| Problema | Causa probable | Solucion |
| --- | --- | --- |
| OpenCode no ve los agentes | Symlink no instalado o OpenCode no reiniciado. | Ejecuta `./setup.sh opencode` y reinicia OpenCode. |
| OpenCode usa configuracion vieja | OpenCode carga config al arrancar. | Cierra y vuelve a abrir OpenCode. |
| El script dice que el destino ya existe | Ya habia config local o symlink distinto. | Confirma backup si quieres reemplazarlo o revisa el destino manualmente. |
| Un enlace apunta a una ruta inesperada | El repo se movio despues de instalar. | Ejecuta de nuevo `./setup.sh opencode` y reemplaza el enlace. |
| `opencode.json` falla al cargar | JSON invalido o campo no soportado por schema. | Valida con `python3 -m json.tool opencode/opencode.json` y revisa `https://opencode.ai/config.json`. |
| Un plugin local no carga | Faltan dependencias npm en `$HOME/.config/opencode/node_modules`. | Ejecuta `./setup.sh opencode` y acepta instalar dependencias, o corre `npm ci --ignore-scripts` dentro de `$HOME/.config/opencode`. |
