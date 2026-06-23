---
name: create-tech-plan
description: >
  Crea planes técnicos ejecutables agnósticos a tecnología. Deriva comandos, validaciones y estructura desde la documentación del proyecto (AGENTS.md, README.md, config).
  Trigger: "plan técnico", "roadmap", "implementation plan", "plan de migración", "plan de refactor", "siguientes pasos"
version: "1.0"
author: mserradas
---

## Propósito

**Regla principal (no negociable):**

> _Todo lo técnico (comandos, herramientas, patrones, estructura de carpetas, convenciones) debe derivarse de las reglas y documentación del proyecto._  
> Fuentes prioritarias: `AGENTS.md`, `README.md` y archivos de configuración/CI presentes en el repositorio.

## Resultados esperados

1. **Plan técnico en Markdown**, orientado a ejecución incremental
2. Plan dividido por **fases atómicas**, cada una con:
   - Objetivo y alcance
   - Cambios esperados (archivos/módulos)
   - Tareas granulares
   - Validaciones derivadas del proyecto
   - Definition of Done (DoD)
   - Riesgos y mitigaciones
3. Bloque inicial de **"Contexto detectado del proyecto"** (auditabilidad)
4. **"Guardián"** (checklist de verificación) por fase y uno final
5. **Ubicación fija:** `/seeds/YYYYMMDD_<slug>.md` (crear carpeta si no existe)

---

## Principios de operación

### P1. Derivación estricta desde el repositorio

- **No inventes** comandos, herramientas, rutas, frameworks o patrones
- Si algo no está respaldado por documentos o configuración del repo → **marcar como "POR CONFIRMAR"** y proponer verificación

### P2. Plan ejecutable, incremental y verificable

- Fases pequeñas con entregables verificables
- Minimizar "Big Bang": cada fase debe dejar el proyecto funcional

### P3. Conservadurismo técnico

- Prioriza cambios con alto ROI (calidad/impacto vs esfuerzo)
- Evita refactors amplios sin necesidad explícita

### P4. Transparencia y trazabilidad

- Explica **por qué** propones cada validación: debe apuntar a fuente del repo (archivo, sección, comando)

### P5. Ejecución secuencial y verificación obligatoria

- **Cada fase debe completarse antes de avanzar a la siguiente**
- Todos los checkboxes `[ ]` del DoD y Guardián de una fase deben marcarse con `[x]` antes de continuar
- No se puede saltar fases ni ejecutar en paralelo sin justificación explícita
- La verificación del Guardián es **obligatoria** antes de dar por completada una fase

---

## Fuentes de verdad (orden de precedencia)

1. **Archivos de configuración LLM:**
   - `CLAUDE.md` (prioridad cuando Claude ejecuta)
   - `AGENTS.md` (fallback o complemento)
   - **Estrategia de merge:** si ambos existen, combinar información. En caso de conflicto, prevalece `CLAUDE.md`
2. `README.md` y documentación enlazada
3. Archivos de tooling/build (`Makefile`, `package.json`, `pyproject.toml`, `pom.xml`, etc.)
4. Configuración de CI (`.github/workflows/*`, `gitlab-ci.yml`, etc.)
5. Estructura real del repositorio (carpetas, módulos)

> En caso de conflicto, gana la fuente con mayor precedencia.

---

## Prohibiciones (anti-alucinación)

**No hagas ninguna de estas acciones:**

- ❌ Prescribir `pytest`, `mypy`, `ruff`, `eslint`, `jest` **si no existen** en el repo
- ❌ Inventar rutas (`src/`, `app/`, `domain/`) si el repo no las usa
- ❌ Asumir arquitectura (Clean, DDD, hexagonal) sin evidencia
- ❌ Crear "mejores prácticas" como requisito si no están en reglas del proyecto
- ❌ Usar comandos genéricos sin verificar en docs/config

---

## Procedimiento (paso a paso)

### FASE 0 — Preparación (Git)

**Objetivo:** entorno limpio y rastreable

**Tareas:**
- Verificar estado de rama actual
- Crear rama nueva según convención del repo (o `plan/<slug>` si no hay)
- Documentar cambios sin commit si existen

**DoD:** Rama creada y lista para trabajo

---

### FASE 1 — Discovery del proyecto (obligatoria)

**Objetivo:** extraer **hechos** del repo para evitar suposiciones

#### 1.1 Recolectar reglas y estándares

**Estrategia de lectura de archivos de configuración:**

1. Buscar `CLAUDE.md` en raíz del proyecto
2. Buscar `AGENTS.md` en raíz del proyecto
3. Aplicar estrategia de merge:
   - Solo `CLAUDE.md` existe → usar como única fuente
   - Solo `AGENTS.md` existe → usar como única fuente
   - Ambos existen → combinar información, `CLAUDE.md` prevalece en conflictos
   - Ninguno existe → marcar GAP y continuar con `README.md`

**Extraer de estos archivos:**
- Convenciones de ramas/commits
- DoD del proyecto
- Comandos oficiales (build/test/lint)
- Estándares de código y arquitectura
- Reglas de PR/review

**Documentar en el plan:**
- Qué archivos se encontraron
- Cuál se usó como principal
- Si hubo conflictos y cómo se resolvieron

**Leer `README.md` y extraer:**
- Cómo ejecutar, construir y testear
- Dependencias y versiones
- Entornos (dev/staging/prod)
- Scripts y workflow recomendado

#### 1.2 Identificar stack real y tooling

- Lenguajes/frameworks desde archivos de configuración
- Comandos ejecutables (scripts, targets, CI)
- Estructura de carpetas y módulos reales

#### 1.3 Salidas obligatorias

Estas se incluirán en el plan:

- **Archivos de configuración encontrados:**
  - `CLAUDE.md`: ✅ encontrado / ❌ no encontrado
  - `AGENTS.md`: ✅ encontrado / ❌ no encontrado
  - Estrategia aplicada: <única fuente / merge / ninguno>
  - Conflictos resueltos: <sí/no - detallar si sí>
- **Stack detectado** (lenguajes, frameworks, runtime)
- **Comandos confirmados** (build, test, lint, typecheck)
- **Convenciones** (ramas, commits, PRs)
- **Estructura real** (carpetas y módulos)
- **Restricciones** (versiones, compatibilidades)
- **Gaps detectados** (ej: "no hay comando de test documentado")

**DoD FASE 1:** El plan puede referenciar comandos y estructura sin inventar

---

### FASE 2 — Definición del objetivo y alcance

**Objetivo:** concretar "qué" se va a hacer y "hasta dónde"

**Tareas:**
- Describir problema/requerimiento
- Listar casos de uso/funcionalidades
- Definir "no alcance" explícito

**DoD:** Alcance y no alcance claros, supuestos marcados

---

### FASE 3 — Diseño del plan técnico (alto nivel)

**Objetivo:** proponer camino técnico alineado con reglas del repo

**Tareas:**
- Proponer arquitectura/estructura **solo si está respaldada por el repo**
- Identificar dependencias (internas/externas)
- Identificar impactos por capas/módulos

**DoD:** Diseño coherente con estructura actual, riesgos identificados

---

### FASE 4 — Descomposición en fases atómicas

**Objetivo:** convertir diseño en fases pequeñas, verificables y ordenadas

Para cada fase incluir:
- Objetivo claro
- Archivos/módulos afectados
- Tareas (granularidad: 30-180 min idealmente)
- Validaciones (comandos del repo)
- Plan de rollback si el riesgo es alto
- DoD específico

**DoD FASE 4:** Todas las fases tienen validación clara y son ejecutables en orden

---

### FASE 5 — Guardián final (integración)

**Objetivo:** asegurar calidad antes de cerrar

**Tareas:**
- Ejecutar suite completa de validaciones del repo
- Checklist final (documentación, tests, compatibilidad, PR)

**DoD:** Repo pasa validaciones confirmadas, docs actualizada

---

## Reglas de ejecución del plan

### Ejecución secuencial obligatoria

1. **Las fases deben ejecutarse en orden estricto** (FASE 0 → FASE 1 → ... → FASE N)
2. **No avanzar a la siguiente fase sin completar la actual**
3. **Marcado de checks obligatorio:**
   - Todos los `[ ]` del DoD deben marcarse como `[x]` antes de avanzar
   - Todos los `[ ]` del Guardián deben marcarse como `[x]` antes de avanzar
   - Si un check no puede completarse, documentar el motivo y marcar como bloqueador

### Formato de marcado

```markdown
✅ Completado:
- [x] Check completado exitosamente

❌ Bloqueado:
- [ ] Check pendiente - BLOQUEADOR: <razón>

⚠️ Omitido con justificación:
- [~] Check omitido - JUSTIFICACIÓN: <razón válida>
```

### Validación de fase completada

Antes de marcar una fase como completada, verificar:
- [ ] Todos los checks del DoD están marcados con `[x]`
- [ ] Todos los checks del Guardián están marcados con `[x]`
- [ ] No hay bloqueadores sin resolver
- [ ] Cambios commiteados (si aplica)
- [ ] Documentación actualizada (si aplica)

### Excepciones justificadas

Solo se permite saltar o modificar el orden de fases si:
- Hay un bloqueador externo documentado
- La fase no es aplicable al proyecto específico (documentar por qué)
- Existe una dependencia que requiere reordenamiento (documentar razón)

En estos casos, **SIEMPRE documentar** la excepción en el plan.

---

## Construcción del "Guardián" (validaciones)

### Regla de construcción

1. **Priorizar comandos oficiales** detectados en AGENTS/README/Makefile/scripts/CI
2. Si faltan comandos → proponer **paso de verificación**:
   - "Identificar/crear comando reproducible para X"
   - Marcar como **GAP** y estimar esfuerzo

### Formato recomendado del Guardián por fase

```markdown
**Guardián (validación):**
- [ ] Formato/lint: `<comando-confirmado>` (fuente: Makefile)
- [ ] Tests: `<comando-confirmado>` (fuente: package.json)
- [ ] Build: `<comando-confirmado>` (fuente: CI)
- [ ] Typecheck: `<comando-confirmado>` (fuente: README.md)
- [ ] Smoke test local (si está documentado)
```

---

## Ubicación del plan (REGLA FIJA)

**Regla absoluta:** los planes **SIEMPRE** se guardan en:

```
/seeds/YYYYMMDD_<slug-corto>.md
```

### Pasos obligatorios

1. Si `/seeds/` no existe → **crear carpeta**
2. Usar fecha actual en formato `YYYYMMDD`
3. Slug en kebab-case, descriptivo y corto
4. Solo letras, números y guiones

### Ejemplos válidos

```
/seeds/20260130_migracion-auth-oauth.md
/seeds/20260130_mejora-cache-api.md
/seeds/20260130_refactor-modulo-pagos.md
```

---

## Formato del documento de salida

El plan **SIEMPRE** incluye estas secciones en orden:

1. **Título**
2. **Contexto detectado del proyecto** (salida de Discovery)
3. **Objetivo**
4. **Alcance / No alcance**
5. **Supuestos y dependencias**
6. **Estrategia técnica (alto nivel)**
7. **Fases (detalle con Guardián cada una)**
8. **Riesgos y mitigaciones**
9. **Próximos pasos priorizados (P1, P2, P3)**

> **Ver plantilla completa en:** `template-plan.md`

---

## Ejemplos de uso

### Ejemplo 1: Migración de autenticación

**Input del usuario:**
```
"Necesito un plan técnico para migrar de JWT a OAuth2 en nuestra API"
```

**Acciones del LLM:**
1. Lee `AGENTS.md` → encuentra convención de ramas: `feat/oauth-migration`
2. Lee `README.md` → detecta: `npm test`, `npm run lint`, `npm run build`
3. Lee `package.json` → confirma framework: Express + TypeScript
4. Detecta estructura: `/src/auth/`, `/src/middleware/`
5. Identifica gaps: no hay tests E2E documentados
6. Crea `/seeds/20260130_migracion-oauth2.md`

**Output:**
- Plan con 5 fases atómicas
- Cada fase usa comandos confirmados (`npm test`, `npm run lint`)
- Marca "tests E2E" como GAP con propuesta de verificación
- No inventa comandos ni rutas
- **DoD y Guardián con checkboxes marcables:** `[ ]` → `[x]` al completar

**Ejemplo de ejecución:**
```markdown
### FASE 2 — Implementar OAuth2 provider

**DoD:**
- [x] Cliente OAuth2 configurado
- [x] Endpoints de autenticación creados
- [x] Tests unitarios pasando

**Guardián:**
- [x] Tests: `npm test` → 45/45 pasando ✅
- [x] Lint: `npm run lint` → sin errores ✅

✅ FASE 2 COMPLETADA - Avanzar a FASE 3
```

---

### Ejemplo 2: Refactor sin documentación clara

**Input del usuario:**
```
"Quiero refactorizar el módulo de pagos para usar clean architecture"
```

**Acciones del LLM:**
1. Lee proyecto → no encuentra `AGENTS.md`
2. Lee `README.md` → solo instrucciones básicas de setup
3. Detecta en código: arquitectura actual es MVC tradicional
4. **No asume** Clean Architecture sin evidencia

**Output:**
- Plan marca varios gaps:
  - "POR CONFIRMAR: ¿Adoptar Clean Architecture es requisito oficial?"
  - "POR CONFIRMAR: ¿Qué problemas específicos resuelve vs arquitectura actual?"
- Propone preguntas específicas al usuario:
  - "¿Existe documentación de arquitectura deseada?"
  - "¿Cuál es el pain point actual del módulo de pagos?"
- Sugiere fase 0 de instrumentación: crear `AGENTS.md` con decisiones

---

## Mensajes al usuario (cuando falta información)

Si `AGENTS.md`/`README.md` no existen o son insuficientes:

1. **Marcar gaps claramente** en el plan
2. Proponer **máximo 5 preguntas muy específicas**:
   - ✅ "¿Cuál es el comando oficial para ejecutar tests?"
   - ✅ "¿Existe convención de ramas/commits?"
   - ✅ "¿Qué entornos existen y cómo se despliega?"
   - ❌ NO preguntar: "¿Cómo funciona el proyecto?" (muy amplio)
3. Proponer tareas de **instrumentación** si el ROI es alto:
   - "Crear Makefile con targets estándar"
   - "Documentar convenciones en AGENTS.md"

---

## Heurísticas de calidad del plan

**Checklist de auto-evaluación:**

- [ ] No he prescrito herramientas/comandos no presentes en el repo
- [ ] Todas las validaciones apuntan a fuentes del repo o están marcadas como gap
- [ ] He documentado qué archivos de configuración encontré (CLAUDE.md/AGENTS.md) y estrategia usada
- [ ] El plan incluye "Contexto detectado del proyecto" con archivos de configuración
- [ ] Cada fase es atómica y verificable
- [ ] Cada fase tiene DoD y Guardián con checkboxes `[ ]` marcables
- [ ] He incluido la regla de marcado obligatorio antes de avanzar de fase
- [ ] Plan guardado en `/seeds/YYYYMMDD_<slug>.md`
- [ ] Carpeta `/seeds/` creada si no existía
- [ ] He priorizado ROI y minimizado riesgo
- [ ] No he asumido arquitectura sin evidencia
- [ ] Nombres y rutas son del repo real, no genéricos

---

## Criterios de éxito de la skill

Un plan técnico es exitoso si:

✅ **Puede ejecutarse sin preguntas adicionales** (o gaps están bien marcados)  
✅ **Todos los comandos son verificables** en el repo  
✅ **No inventa estructura** que no existe  
✅ **Minimiza suposiciones** y las marca explícitamente  
✅ **Es incremental:** cada fase deja el proyecto funcional  
✅ **Es auditable:** se puede rastrear cada decisión a una fuente  

---

## Notas finales

- Esta skill **no** genera código, solo planifica
- Prioriza **descubrir** sobre **asumir**
- En caso de duda → marcar "POR CONFIRMAR" y proponer verificación
- El plan es un **contrato de trabajo**, no una especulación técnica