---
name: angular 21
description: >
  Este skill guía a un LLM para **escribir y refactorizar UI en Angular v21** (componentes standalone por defecto, `OnPush`, DI con `inject()`, signals/effects y plantillas con control flow nativo `@if/@for/@switch`) cumpliendo las restricciones del compilador y evitando anti‑patrones comunes.
  Trigger: Usar cuando el usuario pida crear/editar componentes o “ganchos” (signals/effects), migrar plantillas a control flow moderno o aplicar convenciones de arquitectura/estado en Angular.
license: Apache-2.0
metadata:
  author: mserradas
  version: "1.0"
  auto_invoke: "Desarrollo de componentes Angular"
allowed-tools: Read, Edit, Write, Glob, Grep, Bash, WebFetch, WebSearch, Task
---

## 1) Reglas base (obligatorias)

- **Standalone siempre**. No usar NgModules.
- **NO** poner `standalone: true` en `@Component`/`@Directive` (en Angular v20+ es el default).
- **OnPush siempre**: `changeDetection: ChangeDetectionStrategy.OnPush`.
- **DI con `inject()`** (no inyección por constructor).
- **Plantillas con control flow nativo**: `@if`, `@for`, `@switch` (no `*ngIf/*ngFor/*ngSwitch`).
- **Accesibilidad**: debe pasar AXE y WCAG AA (foco, contraste, ARIA).
- **Imágenes estáticas**: usar `NgOptimizedImage` (no funciona con base64 inline).

---

## 2) Ciclo de vida (regla crítica)

### Constructor (uso restringido)

- El `constructor` se usa **solo** para registrar `effect()`.
- Todo lo demás está prohibido en el `constructor`, incluyendo:
  - inyección por constructor
  - inicialización de estado
  - lecturas de `input()`
  - llamadas a servicios/HTTP
  - lógica de negocio
  - wiring de subscripciones

### `ngOnInit`

Usar para:

- carga inicial (HTTP/servicios)
- inicialización asíncrona
- configuración que depende de `input()` signals
- lógica inicial del feature (si no es puro render)

---

## 3) Arquitectura (feature-based)

- Código por feature en `src/app/features/<feature>/`.
- **Lazy loading obligatorio** para rutas de features (usar `loadComponent`).
- **Features no se hablan entre sí** directamente:
  - Comunicación entre features **solo** vía `core/` (servicios) y/o **stores compartidos** (ver sección 5).
- Patrón **Smart/Dumb**:
  - **Smart (contenedor)**: orquesta estado + llamadas a servicios + efectos del feature.
  - **Dumb (presentacional)**: solo UI; recibe `input()` y emite `output()`; sin lógica de negocio ni HTTP.

---

## 4) Componentes

- Mantener componentes **pequeños** y de **responsabilidad única**.
- Usar `input()` y `output()` (no `@Input/@Output`).
- Preferir template inline si el componente es pequeño.
- Si usas template/style externo:
  - rutas **relativas al TS** del componente (ej. `./mi-componente.html`).
- **NO** usar `@HostBinding` / `@HostListener`:
  - usar `host: { ... }` en el decorador.
- **NO** meter lógica en la plantilla:
  - sin cálculos complejos
  - sin funciones flecha
  - no asumir globales (p. ej. `new Date()`)

---

## 5) Gestión de estado (Signals + @ngrx/signals)

### 5.1 Estado local (componente)

- Para estado estrictamente local del componente: usar **signals** (`signal`, `computed`).
- Actualizaciones:
  - **NO** usar `mutate`
  - usar `set` / `update`

### 5.2 Estado compartido (entre componentes / features)

- Para compartir información **obligatorio** usar `@ngrx/signals`:
  - definir stores (p. ej. SignalStore) para estado compartido
  - exponer state/selectors como signals (read-only hacia fuera)
  - encapsular writes/commands en métodos del store
- No compartir estado con:
  - services con `Subject/BehaviorSubject` (salvo integración externa inevitable)
  - variables globales
  - singletons ad-hoc

### 5.3 Estado derivado

- Derivados siempre con `computed()`.
- Transformaciones puras y predecibles.

---

## 6) RxJS (solo cuando aplique)

- En UI: preferir `async` pipe si el binding es directo en template.
- Si necesitas interoperar con RxJS:
  - convertir a signal con `toSignal()` cuando tenga sentido.
- Suscripciones manuales:
  - **SIEMPRE** limpiar con `takeUntilDestroyed(inject(DestroyRef))`.

---

## 7) Plantillas (restricciones estrictas)

- Control de flujo: `@if`, `@for`, `@switch`.
- Observables en template: `| async`.
- **NO** `ngClass` → usar bindings de `class` (`[class.foo]="cond"`).
- **NO** `ngStyle` → usar bindings de `style` (`[style.width.px]="w()"`).
- **NO** funciones flecha en template.
- **NO** asumir globales como `new Date()`.

---

## 8) Routing

- Rutas de features:
  - **kebab-case**
  - lazy loading con `loadComponent`
- Preferir `withComponentInputBinding()` para mapear params/data a `input()`.

---

## 9) Formularios

- Preferir **Reactive Forms** (tipados).
- Validaciones/errores explícitos, testeables y accesibles.

---

## 10) Servicios

- Un servicio = una responsabilidad.
- Singleton: `@Injectable({ providedIn: 'root' })`.
- Servicios para:
  - integración HTTP
  - IO/infra (storage, analytics, etc.)
  - lógica de dominio si no corresponde al store
- Estado compartido: **no** en servicios; **sí** en `@ngrx/signals` stores.

---

## 11) Coordinacion con UI

- Para componentes PrimeNG, seguir el skill `primeng-21`.
- Para reglas y buenas practicas de Tailwind, seguir el skill `tailwind-4`.
