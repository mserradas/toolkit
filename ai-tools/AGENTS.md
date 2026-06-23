# AGENTS.md Example

> Plantilla y guia para crear un `AGENTS.md` util en cualquier proyecto.
> Copia este archivo al repo objetivo y reemplaza las secciones de ejemplo por
> informacion real del proyecto.

## Objetivo

Un `AGENTS.md` debe darle a un agente de codigo el contexto minimo para trabajar
sin romper convenciones del proyecto. No es un README para humanos ni una copia
de toda la documentacion: es una guia operativa con reglas, comandos y limites.

Un buen archivo responde rapido a estas preguntas:

1. Que es este proyecto y que stack usa.
2. Donde vive cada tipo de codigo.
3. Como se instala, ejecuta, verifica y prueba.
4. Que convenciones tecnicas son obligatorias.
5. Que no debe tocarse sin aprobacion humana.
6. Como cerrar una tarea con evidencia.

## Principios

- Especifico del repo: evita reglas genericas que aplicarian a cualquier codigo.
- Corto y accionable: prioriza comandos, rutas, limites y ejemplos concretos.
- Actualizado: si cambia el stack, scripts o arquitectura, actualiza este archivo
  en el mismo PR.
- Verificable: cada regla importante debe poder comprobarse con un comando, ruta,
  test o criterio claro.
- Sin secretos: nunca incluyas tokens, claves, URLs privadas con credenciales,
  dumps de datos ni valores de `.env`.
- Sin rutas personales: usa rutas relativas al repo o variables como `$HOME`.
- Sin contradicciones: si el README, CI o Makefile dicen otra cosa, alinea las
  fuentes antes de pedirle trabajo al agente.

## Checklist De Contenido

Incluye estas secciones cuando apliquen:

| Seccion | Debe responder |
| --- | --- |
| Resumen del proyecto | Que hace el repo, usuarios principales, runtime y stack. |
| Estructura | Carpetas clave y responsabilidad de cada una. |
| Setup local | Dependencias, versiones, variables requeridas y comandos iniciales. |
| Comandos | Build, dev server, tests, lint, typecheck, format y migraciones. |
| Arquitectura | Capas, boundaries, patrones obligatorios y dependencias prohibidas. |
| Convenciones de codigo | Estilo, naming, errores, logging, i18n, accesibilidad, etc. |
| Testing | Donde van los tests, que cubrir, comandos por nivel y fixtures. |
| Seguridad | Secretos, datos sensibles, permisos, input externo y redaccion de logs. |
| Datos y migraciones | Como crear, aplicar, revertir y validar cambios persistentes. |
| Git y PRs | Branching, commits, checks requeridos y reglas de review. |
| Documentacion | Que docs actualizar y donde registrar decisiones. |
| Guardrails de agentes | Que puede hacer el agente solo y cuando debe preguntar. |
| Troubleshooting | Fallos comunes del entorno y solucion conocida. |

No todas las secciones son obligatorias. Si el proyecto es pequeno, conserva solo
las que cambian el comportamiento del agente.

## Guardrails Para Agentes

Estas reglas suelen ser utiles en casi todos los proyectos:

- Leer el codigo existente antes de proponer cambios.
- Preferir patrones locales frente a introducir abstracciones nuevas.
- No reescribir archivos completos si basta un cambio pequeno.
- No revertir cambios no propios sin confirmacion explicita.
- No ejecutar comandos destructivos (`rm -rf`, `git reset --hard`,
  `git clean -fd`, migraciones irreversibles) sin aprobacion humana.
- No instalar, actualizar ni eliminar dependencias sin justificarlo.
- No modificar contratos publicos, esquemas persistidos, APIs, permisos,
  autenticacion o infraestructura sin plan y validacion.
- Ejecutar la verificacion mas acotada posible despues de cambiar codigo.
- Reportar comandos ejecutados, resultado y cualquier test pendiente.
- Si falta informacion bloqueante, preguntar antes de inventar requisitos.

## Anti-Patrones

Evita estos problemas al escribir un `AGENTS.md`:

- Contexto inflado: pegar documentos largos que el agente no necesita en cada
  tarea.
- Reglas vagas: "escribe buen codigo", "haz tests" o "sigue buenas practicas"
  sin definir comandos ni criterios.
- Stack falso: dejar referencias a frameworks, carpetas o comandos que no existen.
- Contradicciones: permitir algo en una seccion y prohibirlo en otra.
- Politicas imposibles: exigir 100% de cobertura o suites lentas para cada cambio
  trivial si el proyecto no lo practica.
- Secretos o datos reales: incluir ejemplos con credenciales, PII o tokens.
- Preferencias personales: alias locales, rutas de una maquina o herramientas que
  no son parte del proyecto.

## Plantilla Recomendada

Usa esta plantilla como punto de partida.

```markdown
# Repository Guidelines

> Stack: <lenguaje/runtime/frameworks principales>
> Package manager: <npm/pnpm/yarn/uv/poetry/go/cargo/etc.>
> Ultima revision: YYYY-MM-DD

## Resumen Del Proyecto

<1-3 parrafos: que hace el producto, para quien, y que partes del repo son
criticas. No incluir detalles de negocio confidenciales si el repo es compartido.>

## Estructura

| Ruta | Responsabilidad |
| --- | --- |
| `src/` | Codigo de aplicacion. |
| `tests/` | Tests automatizados. |
| `docs/` | Documentacion tecnica y decisiones. |
| `scripts/` | Utilidades de mantenimiento. |

Reglas de ubicacion:

- Nuevas features van en `<ruta>`.
- Codigo compartido va en `<ruta>`.
- No importar desde `<ruta prohibida>` hacia `<ruta>`.

## Setup Local

1. Instalar dependencias:

   ```bash
   <comando>
   ```

2. Configurar entorno:

   ```bash
   cp .env.example .env
   ```

3. Arrancar servicios locales:

   ```bash
   <comando>
   ```

Notas:

- Version requerida de runtime: `<version>`.
- Variables obligatorias: `<nombres sin valores reales>`.
- Servicios externos en local: `<docker compose, emuladores, mocks>`.

## Comandos

Usa estos comandos desde la raiz del repo:

| Tarea | Comando |
| --- | --- |
| Instalar | `<comando>` |
| Desarrollo | `<comando>` |
| Build | `<comando>` |
| Tests unitarios | `<comando>` |
| Tests integracion | `<comando>` |
| Lint | `<comando>` |
| Typecheck | `<comando>` |
| Format check | `<comando>` |
| Migraciones | `<comando>` |

Orden recomendado antes de cerrar un cambio:

1. `<test acotado>`
2. `<lint/typecheck>`
3. `<suite amplia si aplica>`

## Arquitectura

- Patron principal: `<clean architecture, MVC, feature modules, hexagonal, etc.>`.
- Boundaries obligatorios:
  - `<capa A>` puede importar `<capa B>`.
  - `<capa B>` no puede importar `<capa A>`.
- Contratos publicos viven en `<ruta>`.
- Cambios en contratos publicos requieren actualizar `<docs/tests/schemas>`.

Decisiones importantes:

- `<decision>` porque `<motivo>`.
- `<decision>` se registra en `<ADR/docs>` cuando cambie.

## Convenciones De Codigo

- Lenguaje/estilo: `<reglas concretas>`.
- Tipado: `<strict, no any, null handling, etc.>`.
- Errores: `<como crear/mapear errores>`.
- Logging: `<que loggear y que redactar>`.
- UI/accesibilidad/i18n si aplica: `<reglas concretas>`.
- No introducir dependencias nuevas sin aprobacion.

## Testing

- Tests unitarios en `<ruta>`.
- Tests de integracion en `<ruta>`.
- Fixtures en `<ruta>`.
- Cada bug fix debe incluir test de regresion salvo que se justifique.
- Evitar snapshots grandes o fragiles salvo convencion existente.

Para cambios pequenos, ejecutar:

```bash
<comando acotado>
```

Para cambios de alto impacto, ejecutar:

```bash
<comando amplio>
```

## Seguridad

- Nunca hardcodear secretos.
- Usar `.env.example` solo con nombres y valores ficticios.
- No loggear tokens, passwords, headers de auth, PII ni payloads sensibles.
- Validar input externo en `<capa/ruta>`.
- Cambios en auth, permisos, crypto, datos sensibles o red requieren revision
  explicita.

## Datos Y Migraciones

- Migraciones se crean con `<comando>`.
- Revisar migraciones antes de aplicarlas.
- Incluir estrategia de rollback para cambios irreversibles.
- No ejecutar migraciones contra entornos compartidos sin aprobacion.

## Documentacion

Actualizar documentacion cuando cambie:

- API publica: `<ruta>`.
- Configuracion/env vars: `<ruta>`.
- Decisiones tecnicas: `<ruta ADR>`.
- Guia de usuario: `<ruta>`.

## Workflow De Git

- Branches: `<convencion>`.
- Commits: `<convencion>`.
- Antes de PR: `<checks>`.
- No reescribir historial compartido sin aprobacion.

## Instrucciones Para Agentes

- Empieza revisando `git status --short`.
- Lee archivos relevantes antes de editar.
- Manten cambios acotados al pedido.
- Respeta cambios existentes del usuario.
- No ejecutes comandos destructivos sin confirmacion.
- Si cambias codigo, ejecuta verificacion y reporta resultado.
- Si no puedes verificar, explica por que y que comando falta ejecutar.

## Troubleshooting

| Problema | Causa probable | Solucion |
| --- | --- | --- |
| `<sintoma>` | `<causa>` | `<comando/paso>` |
```

## Ejemplo De Reglas Especificas

Estas reglas son ejemplos de buen nivel de detalle. Adaptalas al proyecto real.

```markdown
## Arquitectura

- `domain/` no importa frameworks ni clientes externos.
- `application/` orquesta casos de uso y depende de interfaces, no de adapters.
- `infrastructure/` implementa adapters y mapea modelos externos a entidades.
- Los endpoints solo convierten HTTP <-> DTO y llaman casos de uso.

## Comandos

- Usa `pnpm` en este repo; no generar `package-lock.json`.
- Verificacion rapida: `pnpm test -- --runInBand <archivo>`.
- Verificacion completa antes de PR: `pnpm lint && pnpm typecheck && pnpm test`.

## Seguridad

- Los ejemplos de `.env` deben usar valores ficticios.
- Redactar `Authorization`, cookies, tokens y emails en logs.
- Cualquier cambio en roles/permisos requiere test de autorizacion.
```

## Como Mantenerlo

Revisa el `AGENTS.md` cuando ocurra cualquiera de estos cambios:

- Nuevo package manager, runtime o version principal.
- Nuevos comandos de CI o cambios en scripts.
- Reorganizacion de carpetas.
- Nueva arquitectura, capa, modulo o boundary.
- Cambio en estrategia de testing.
- Nueva politica de seguridad, datos o compliance.
- Incidente causado por instrucciones incompletas o antiguas.

El mejor `AGENTS.md` no es el mas largo. Es el que evita errores repetidos y
permite cerrar tareas con evidencia sin preguntar lo mismo en cada sesion.
