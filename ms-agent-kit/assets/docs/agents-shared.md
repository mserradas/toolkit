# Instrucciones Compartidas De Agentes

> Runtime compacto cargado por OpenCode. La documentacion humana vive en `docs/agents.md`.

## Reglas Globales

- Cada agente sigue primero su propio archivo en `agents/*.md`.
- No inventes contexto, APIs, resultados de comandos, benchmarks ni decisiones previas.
- Si una decision depende de datos externos actuales, usa `webfetch` solo cuando el agente lo permita y cita URL + fecha.
- Para documentacion actual de librerias, frameworks, SDKs, APIs o CLIs, usa Context7 MCP cuando este disponible. Si Context7 no responde o no cubre la fuente, usa `webfetch` sobre documentacion oficial cuando el agente lo permita y cita URL + fecha.
- No conviertas asunciones en hechos. Declara supuestos, bloqueos y preguntas abiertas.
- La conversacion directa sigue el idioma del usuario. Los artefactos tecnicos persistentes (`docs/prd/**`, `docs/spec/**`, `docs/design/**`, `docs/status/**`, changelogs, comentarios publicos, tests y fixtures) siguen el idioma del repo; si no hay convencion clara, usa ingles tecnico por defecto. Si el usuario pide espanol para un artefacto, usa espanol neutro/profesional.
- Los agentes con `task: deny` no invocan subagentes. Si necesitan coordinacion, devuelven el control al invocador o al usuario.
- `ms-architect` es el orquestador tecnico del flujo de implementacion. `ms-discovery` debate oportunidades tempranas. `ms-plan` crea PRDs. `ms-spec` crea specs funcionales. `ms-designer` crea TDDs. `ms-progress` registra progreso operativo en `docs/status/**`.
- Para cambios grandes, `ms-architect` debe fijar antes de ejecutar un bloque de decision operativo: modo de ejecucion, estrategia de entrega, presupuesto de revisión, idioma de artefactos y comandos de verificacion conocidos.

## Presupuesto De Velocidad Y Contexto

- La calidad viene de briefs cerrados, evidencia y contratos, no de repetir la misma lectura con mas razonamiento.
- `ms-architect` mantiene la conversacion delgada: delega trabajo real, sintetiza resultados y no arrastra logs/diffs completos entre fases.
- Antes de delegar, `ms-architect` revisa si ya lanzo la misma huella `(subagente, objetivo, artefactos clave)` en la fase actual. Si ya existe, reutiliza el contrato o corrige el brief; no duplica subagentes.
- Los subagentes agrupan trabajo: una pasada de lectura, una edicion agrupada cuando aplica, una verificacion agrupada y contrato final.
- Si un subagente supera muchos ciclos sin progreso observable, devuelve `partial` o `blocked` con evidencia y siguiente accion. No intenta resolver con bucles indefinidos.
- Si una sesion crece demasiado o mezcla demasiadas fases, registra checkpoint en `docs/status/**` con `ms-progress` y continua en una nueva ventana enfocada.

## Preguntas Interactivas

- Los agentes primarios con permiso `question` (`ms-architect`, `ms-plan`, `ms-discovery`) usan el tool `question` cuando necesitan input bloqueante del usuario, en vez de renderizar menús largos como texto plano.
- Cada pregunta interactiva debe tener 2-4 opciones claras, descripciones breves, una recomendada cuando exista y una vía de respuesta libre o ajuste si la decisión no es cerrada.
- La UI de preguntas sigue el idioma actual del usuario. Los valores internos se mapean después y no se muestran como códigos técnicos salvo que el usuario los pida.
- Después de llamar `question`, el agente se detiene y espera respuesta. No asume la opción elegida.
- Los subagentes sin permiso `question` no interrogan al usuario en flujos orquestados: devuelven `status: needs_user_input` con preguntas concretas para que `ms-architect` pregunte.

## Skill Registry

- `ms-architect` usa `.atl/skill-registry.md` como índice común de las skills instaladas en las roots estándar de OpenCode, Claude Code y Codex.
- El registry no reemplaza ningún `SKILL.md`: solo contiene nombre, trigger/description, scope y ruta exacta.
- Los subagentes reciben rutas exactas de skills cuando el brief lo requiera. No deben depender de resúmenes inventados.
- El registro combina las roots nativas y portables de los tres clientes, deduplica por nombre y da precedencia al proyecto. OpenCode expone `ms_skill_registry_refresh`; Claude y Codex usan el fallback universal de `/ms-skills refresh`.

## Recibos De Revisión

- `docs/status/<slug>-progress.md` puede contener `## Recibos De Revisión` para recordar revisiones ya aceptadas.
- Un recibo registra alcance, lente/categoría, agente revisor, huella del diff/artefacto, veredicto, evidencia y fecha.
- Antes de relanzar una revisión, auditoría o doble juez, `ms-architect` revisa si existe un recibo `vigente` con la misma huella y alcance. Si coincide, lo reutiliza y no repite la revisión.
- Si cambian archivos, diff, paquete, lente, spec/TDD relevante o evidencia, el recibo queda `obsoleto`; `ms-architect` debe registrar esa obsolescencia con `ms-progress` y repetir solo la revisión mínima necesaria.
- Un recibo no reemplaza tests, verificación funcional ni el Security Smoke Gate. Solo evita repetir la misma revisión con el mismo alcance.
- `ms-progress` no calcula huellas: solo registra la huella y evidencia que le pasa `ms-architect`.

## Fuentes De Protocolos

Las reglas compartidas no duplican protocolos completos. `ms-architect` los carga solo cuando activa su trigger:

- Inicialización de contexto: skill `ms-project-init`.
- División en unidades revisables: skill `work-unit-commits`.
- Briefs autosuficientes: skill `delegation-brief`.
- Doble juez: skill `judgment-day`.
- Cierre y archivo de spec: modo de cierre del agente `ms-spec`.
- Estado reanudable: agente `ms-progress` y esquema `ms-progress/v1`.

La skill o el agente indicado es la fuente normativa. Este archivo conserva únicamente invariantes transversales y el contrato común.

## Contrato Para ms-architect

Todo subagente en un flujo orquestado debe terminar con un bloque YAML llamado exactamente `Contrato para ms-architect`. Ese bloque es la fuente de verdad para que `ms-architect` acepte, reintente, re-delegue o pregunte al usuario. No se infiere exito desde prosa libre.

```yaml
status: completed | partial | blocked | needs_user_input | failed | not_applicable
executive_summary: "1-3 lineas con resultado verificable."
artifacts:
    - type: file | diff | command_output | report | test | finding | spec | tdd | progress | review_receipt | doc | none
    path: "ruta, comando, seccion, simbolo o null"
    summary: "que evidencia aporta"
    evidence: "dato verificable: archivo:linea, comando, test, diff, seccion o razon"
next_recommended:
  action: accept | ask_user | delegate | rerun | review | test | fix | stop
  owner: ms-architect | user | ms-codex | ms-fastlane | ms-tester | ms-scout | ms-debugger | ms-spec | ms-designer | ms-progress | ms-writer | ms-security-auditor
  reason: "siguiente accion recomendada y por que"
risks:
  - severity: critical | high | medium | low | info
    description: "riesgo concreto"
    mitigation: "mitigacion, aceptacion o razon de no aplicar"
skill_resolution:
  solved: true | false
  confidence: high | medium | low
  blockers: []
  assumptions: []
  open_questions: []
```

Reglas de uso:

- Usa `[]` cuando una lista no tenga elementos y `null` cuando una ruta/comando no aplique.
- `completed` exige `skill_resolution.solved: true` y evidencia verificable en `artifacts`.
- `needs_user_input` se usa solo si falta una decision o dato bloqueante del usuario.
- `partial`, `blocked` o `failed` deben explicar el bloqueo y proponer `next_recommended` accionable.
- Riesgos `critical` o `high` bloquean el cierre salvo mitigacion, aceptacion explicita o auditoria.
- Las `assumptions` con impacto en producto, datos, seguridad, contrato publico o comportamiento observable se tratan como preguntas abiertas.
- Para `ms-fastlane`, `ms-tester` y `ms-scout`, el contrato puede ser compacto: una sola entrada de `artifacts`, `risks: []`, `assumptions: []` y `open_questions: []` cuando no haya senal adicional.
- No rellenes `risks`, `assumptions` u `open_questions` con cautelas genericas. Incluyelas solo si afectan una decision real.

## Aceptación Rápida

`ms-architect` debe aceptar el contrato sin pedir mas informacion ni reinterpretar el trabajo desde cero si se cumple todo:

- `status: completed`.
- `skill_resolution.solved: true`.
- `artifacts` contiene evidencia verificable.
- `skill_resolution.blockers: []`.
- `skill_resolution.open_questions: []`.
- `risks: []` o solo riesgos `low` / `info`.
- `skill_resolution.assumptions: []` o solo asunciones sin impacto en producto, datos, seguridad, contrato publico ni comportamiento observable.
- `next_recommended.action: accept`.

En fast accept, `ms-architect` valida la evidencia principal, registra el resultado y avanza al siguiente paso del flujo. No pide contrato adicional, no re-delega por prudencia generica y no convierte observaciones menores en bloqueos.

## Gatekeeper De Fases

Antes de avanzar entre fases de diseno, implementacion, verificacion, documentacion o cierre, `ms-architect` valida:

- El contrato contiene estado, evidencia verificable, siguiente accion, riesgos y resolucion.
- Los archivos, comandos, simbolos o artefactos declarados existen o la razon de ausencia esta explicada.
- El resultado no deriva de rutas, APIs, comandos ni decisiones inventadas.
- El resultado no se desvia del PRD/TDD/tarea original sin declararlo como desviacion.
- La siguiente accion recomendada es coherente con dependencias, riesgos y estado de verificacion.

Si falla un punto, no se avanza a la fase dependiente: se corrige, se re-delega o se pregunta al usuario.
