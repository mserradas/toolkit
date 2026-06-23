# Plantilla de Plan Técnico

> **Uso:** Esta plantilla se usa como base para generar planes técnicos ejecutables.  
> **Importante:** Rellenar con hechos derivados del repositorio, no inventar comandos o estructura.

---

**Metadata del plan:**

```yaml
title: "<TÍTULO DEL PLAN>"
date: "<YYYY-MM-DD>"
status: "draft"
output_path: "/seeds/YYYYMMDD_<slug-corto>.md"
repo_context_sources:
  - "AGENTS.md#<sección-si-aplica>"
  - "README.md#<sección-si-aplica>"
  - "<archivo-config>#<detalle-si-aplica>"
```

---

# <TÍTULO DEL PLAN>

## 1) Contexto detectado del proyecto

> **Propósito:** Auditar qué información se extrajo del repositorio para fundamentar el plan.

### Archivos de configuración del proyecto detectados

- **CLAUDE.md:** <✅ encontrado / ❌ no encontrado>
  - <Si se encontró, listar reglas clave extraídas>
  
- **AGENTS.md:** <✅ encontrado / ❌ no encontrado>
  - <Si se encontró, listar reglas clave extraídas>

- **Estrategia aplicada:** <única fuente: CLAUDE.md / única fuente: AGENTS.md / merge de ambos / ninguno encontrado>

- **Conflictos detectados y resolución:**
  - <Conflicto 1>: <Cómo se resolvió - CLAUDE.md prevaleció>
  - <O: "Sin conflictos detectados">

### Stack detectado

- **Lenguajes:** <lenguajes principales del proyecto>
- **Frameworks/librerías relevantes:** <frameworks usados>
- **Runtime/entorno:** <Node.js 18, Python 3.11, JVM 17, etc.>
- **Estructura del repo (carpetas relevantes):**
  ```
  /src/          - Código principal
  /tests/        - Tests
  /docs/         - Documentación
  /scripts/      - Scripts auxiliares
  ```

### Comandos confirmados

> **Regla:** Solo incluir comandos respaldados por el repo (AGENTS/README/config/CI).

- **Build:** `<comando>` (fuente: <Makefile/package.json/etc>)
- **Tests:** `<comando>` (fuente: <archivo>)
- **Lint/Format:** `<comando>` (fuente: <archivo>)
- **Typecheck/Static analysis:** `<comando>` (fuente: <archivo>)
- **E2E/Integration:** `<comando>` (fuente: <archivo>) o "N/A - no documentado"

### Convenciones del proyecto

- **Ramas:** `<convención de naming, ej: feat/*, fix/*>` (fuente: AGENTS.md)
- **Commits:** `<formato, ej: Conventional Commits>` (fuente: AGENTS.md)
- **PR / Code review:** `<reglas, ej: requiere 2 aprobaciones>` (fuente: AGENTS.md)
- **DoD (si está definido):**
  - [ ] <criterio 1>
  - [ ] <criterio 2>
  - [ ] <criterio N>

### Gaps / "POR CONFIRMAR"

> **Propósito:** Marcar explícitamente qué falta documentar o verificar.

- **Gap 1:** <descripción del gap> → **Cómo verificarlo:** <acción propuesta>
- **Gap 2:** <descripción del gap> → **Cómo verificarlo:** <acción propuesta>

---

## 2) Objetivo

**Qué se pretende lograr:**

<Descripción clara y concreta del objetivo del plan. Ejemplo: "Migrar el sistema de autenticación de JWT a OAuth2 para mejorar seguridad y permitir integración con proveedores externos">

**Motivación/Contexto:**

<Por qué es necesario este cambio. Ejemplo: "El sistema actual de JWT no soporta refresh tokens seguros ni integración con SSO corporativo">

---

## 3) Alcance

### Incluye

- <Funcionalidad/módulo 1 que SÍ está en alcance>
- <Funcionalidad/módulo 2 que SÍ está en alcance>
- <Funcionalidad/módulo N que SÍ está en alcance>

### No incluye

> **Propósito:** Evitar scope creep y expectativas incorrectas.

- <Funcionalidad/módulo 1 que NO está en alcance>
- <Funcionalidad/módulo 2 que NO está en alcance>
- <Funcionalidad/módulo N que NO está en alcance>

---

## 4) Supuestos y dependencias

### Supuestos

> **Propósito:** Hacer explícitas las asunciones que fundamentan el plan.

- **Supuesto 1:** <descripción> → **Impacto si es falso:** <qué pasaría>
- **Supuesto 2:** <descripción> → **Impacto si es falso:** <qué pasaría>

### Dependencias

**Internas (del proyecto):**
- <Módulo/componente del que depende este trabajo>

**Externas:**
- <Servicio externo, API, biblioteca de terceros>

### Restricciones

- **Técnicas:** <ej: debe ser compatible con Node.js 16+>
- **Operativas:** <ej: no puede haber downtime en producción>
- **De tiempo:** <ej: debe completarse antes del Q2>

---

## 5) Estrategia técnica (alto nivel)

### Enfoque propuesto

> **Regla:** Debe estar alineado con la arquitectura y convenciones del repo.

<Descripción del enfoque técnico. Ejemplo: "Implementación incremental por capas: primero adaptar capa de autenticación, luego middleware, finalmente endpoints. Mantener compatibilidad temporal con JWT durante la transición">

### Impacto en módulos/componentes existentes

| Módulo/Componente | Tipo de cambio | Riesgo | Notas |
|-------------------|----------------|--------|-------|
| `/src/auth/`      | Refactor       | Medio  | Núcleo del cambio |
| `/src/middleware/`| Modificación   | Bajo   | Adaptar a nuevo flujo |
| `/src/api/routes/`| Mínimo         | Bajo   | Solo ajustes de config |

### Alternativas consideradas (opcional)

| Alternativa | Pros | Contras | Por qué se descartó |
|-------------|------|---------|---------------------|
| <Alternativa 1> | ... | ... | ... |

---

## 6) Fases

> **Regla:** Cada fase debe ser ejecutable, verificable y dejar el repo en estado funcional.

> **⚠️ IMPORTANTE - Ejecución secuencial:**
> - Marcar TODOS los checks `[x]` del DoD y Guardián antes de avanzar a la siguiente fase
> - No saltar fases sin justificación documentada
> - Si un check no puede completarse, marcar como bloqueador: `[ ] BLOQUEADOR: <razón>`

### FASE 0 — Preparación (Git)

**Objetivo:** Asegurar entorno limpio y rastreable

**Tareas:**
- [ ] Verificar estado de la rama actual: `git status`
- [ ] Verificar que no hay cambios sin commit críticos (o documentarlos)
- [ ] Crear rama según convención: `<convención-detectada>/nombre` o `plan/<slug>` si no hay convención
- [ ] Sincronizar con remoto: `git fetch origin`

**Guardián (validación):**
- [ ] Ejecutar: `git status` → debe estar limpio o cambios documentados
- [ ] Ejecutar: `git branch` → debe mostrar rama nueva creada

**DoD:**
- [ ] Rama creada y lista para trabajo
- [ ] Estado del repo documentado si hay excepciones

---

### FASE 1 — Discovery del proyecto

**Objetivo:** Extraer contexto real del repositorio para evitar suposiciones

**Tareas:**
- [ ] Leer `AGENTS.md` (si existe) y extraer reglas/convenciones
- [ ] Leer `README.md` y extraer comandos, setup, workflow
- [ ] Identificar tooling desde archivos de config (package.json, pyproject.toml, etc.)
- [ ] Identificar configuración de CI/CD
- [ ] Mapear estructura de carpetas y módulos principales
- [ ] Documentar gaps encontrados

**Guardián (validación):**
- [ ] Completar sección "Contexto detectado del proyecto" de este plan
- [ ] Verificar que todos los comandos listados son ejecutables: `<comando> --help`

**DoD:**
- [ ] Contexto auditado y completo
- [ ] Comandos confirmados (o gaps marcados como "POR CONFIRMAR")
- [ ] Estructura real del repo documentada

---

### FASE 2 — <Nombre descriptivo de la fase>

**Objetivo:** <Qué se logra en esta fase específica>

**Cambios esperados (archivos/módulos):**
- `<ruta/archivo1>` - <tipo de cambio>
- `<ruta/archivo2>` - <tipo de cambio>
- `<ruta/archivoN>` - <tipo de cambio>

**Tareas:**
- [ ] <Tarea 1 - granularidad: 30-180 min>
- [ ] <Tarea 2>
- [ ] <Tarea 3>
- [ ] <Tarea N>

**Guardián (validación):**
- [ ] Ejecutar: `<comando-confirmado>` (fuente: <archivo del repo>)
- [ ] Ejecutar: `<comando-confirmado>` (fuente: <archivo del repo>)
- [ ] Verificar: <criterio manual si aplica>

**Riesgos:**
- **Riesgo 1:** <descripción> → **Probabilidad:** <Alta/Media/Baja> → **Mitigación:** <cómo reducirlo>
- **Riesgo 2:** <descripción> → **Probabilidad:** <Alta/Media/Baja> → **Mitigación:** <cómo reducirlo>

**Plan de rollback (si el riesgo es alto):**
- <Paso 1 para revertir cambios>
- <Paso 2 para revertir cambios>

**DoD:**
- [ ] <Criterio específico de completitud 1>
- [ ] <Criterio específico de completitud 2>
- [ ] Todas las validaciones del Guardián pasan ✅

---

### FASE 3 — <Nombre descriptivo de la fase>

**Objetivo:** <Qué se logra en esta fase específica>

**Cambios esperados (archivos/módulos):**
- `<ruta/archivo1>` - <tipo de cambio>
- `<ruta/archivo2>` - <tipo de cambio>

**Tareas:**
- [ ] <Tarea 1>
- [ ] <Tarea 2>
- [ ] <Tarea N>

**Guardián (validación):**
- [ ] Ejecutar: `<comando-confirmado>` (fuente: <archivo del repo>)
- [ ] Ejecutar: `<comando-confirmado>` (fuente: <archivo del repo>)

**Riesgos:**
- <Riesgos específicos de esta fase>

**DoD:**
- [ ] <Criterio específico 1>
- [ ] <Criterio específico 2>
- [ ] Todas las validaciones del Guardián pasan ✅

---

### FASE N — <Nombre descriptivo de la fase>

**Objetivo:** <Qué se logra en esta fase específica>

**Cambios esperados (archivos/módulos):**
- `<ruta/archivo1>` - <tipo de cambio>

**Tareas:**
- [ ] <Tarea 1>
- [ ] <Tarea 2>

**Guardián (validación):**
- [ ] Ejecutar: `<comando-confirmado>` (fuente: <archivo del repo>)

**DoD:**
- [ ] <Criterio específico 1>
- [ ] Todas las validaciones del Guardián pasan ✅

---

### FASE FINAL — Guardián de integración

**Objetivo:** Asegurar calidad antes de cerrar el plan

**Tareas:**
- [ ] Ejecutar suite completa de tests: `<comando confirmado>`
- [ ] Ejecutar lint completo: `<comando confirmado>`
- [ ] Ejecutar build de producción: `<comando confirmado>`
- [ ] Verificar que documentación está actualizada (README, CHANGELOG, etc.)
- [ ] Revisar que todos los DoD de fases anteriores están cumplidos
- [ ] Preparar PR según convenciones del proyecto

**Guardián (validación final):**
- [ ] ✅ Tests: `<comando>` → 100% pasan
- [ ] ✅ Lint: `<comando>` → sin errores
- [ ] ✅ Build: `<comando>` → exitoso
- [ ] ✅ Typecheck: `<comando>` → sin errores
- [ ] ✅ E2E (si aplica): `<comando>` → pasan casos críticos
- [ ] ✅ Smoke test manual: <descripción del test>

**Checklist de calidad:**
- [ ] Código sigue convenciones del proyecto
- [ ] Tests cubren casos principales (% de cobertura si está definido)
- [ ] Sin warnings bloqueantes
- [ ] Documentación técnica actualizada
- [ ] CHANGELOG actualizado (si aplica)
- [ ] Migraciones de datos documentadas (si aplica)
- [ ] Rollback plan documentado (si el cambio es crítico)

**DoD:**
- [ ] Todos los Guardianes pasan ✅
- [ ] PR creado y listo para review
- [ ] Documentación completa

---

## 7) Riesgos y mitigaciones

| Riesgo | Impacto | Probabilidad | Mitigación | Señal de alerta |
|--------|---------|--------------|------------|-----------------|
| <Riesgo técnico 1> | Alto/Medio/Bajo | Alta/Media/Baja | <Cómo mitigarlo> | <Qué indicador observar> |
| <Riesgo técnico 2> | Alto/Medio/Bajo | Alta/Media/Baja | <Cómo mitigarlo> | <Qué indicador observar> |
| <Riesgo operativo> | Alto/Medio/Bajo | Alta/Media/Baja | <Cómo mitigarlo> | <Qué indicador observar> |

### Riesgos de integración

- <Riesgo específico de integración con otros sistemas>

### Riesgos de dependencias

- <Riesgo relacionado con dependencias externas>

---

## 8) Próximos pasos priorizados

### P1 (Prioridad Alta - Hacer primero)

- [ ] <Acción crítica inmediata>
- [ ] <Acción crítica inmediata>

### P2 (Prioridad Media - Hacer después)

- [ ] <Acción importante pero no bloqueante>
- [ ] <Acción importante pero no bloqueante>

### P3 (Prioridad Baja - Nice to have)

- [ ] <Mejora opcional>
- [ ] <Mejora opcional>

---

## 9) Notas adicionales

### Decisiones técnicas clave

- **Decisión 1:** <descripción> → **Rationale:** <por qué se tomó>
- **Decisión 2:** <descripción> → **Rationale:** <por qué se tomó>

### Referencias útiles

- <Enlace a documentación relevante>
- <Enlace a ADR (Architecture Decision Record) si aplica>
- <Enlace a issues/tickets relacionados>

### Lecciones aprendidas (actualizar post-ejecución)

> **Propósito:** Documentar qué funcionó bien y qué mejorar para futuros planes.

- <Lección aprendida 1>
- <Lección aprendida 2>

---

## Historial de cambios

| Fecha | Versión | Cambios | Autor |
|-------|---------|---------|-------|
| YYYY-MM-DD | 1.0 | Plan inicial | <nombre> |
| YYYY-MM-DD | 1.1 | <Actualización realizada> | <nombre> |

---

**Fin del plan técnico**