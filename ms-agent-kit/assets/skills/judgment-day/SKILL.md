---
name: judgment-day
description: "Ejecuta revisión adversarial con doble juez ciego. Úsala cuando el usuario pida Judgment Day, doble juez, doble revisión, revisión adversarial, que lo juzguen, o cuando un diff/TDD/spec de alto riesgo necesite confirmación independiente antes de cerrar."
---

# Judgment Day

Usa esta skill para revisar un objetivo concreto con dos jueces independientes antes de aceptar o corregir trabajo de alto riesgo.

## Contrato De Activación

Úsala solo actuando como `ms-architect` u otro orquestador con delegación a subagentes. Si se carga dentro de un ejecutor o worker de solo lectura, detente y devuelve el control a `ms-architect`.

La skill coordina jueces; no autoriza al orquestador a revisar el objetivo inline ni a ejecutar correcciones.

El objetivo debe ser concreto:

- diff,
- archivos,
- TDD/spec,
- feature slice,
- PR boundary,
- architecture slice.

Si el objetivo o los criterios no están claros, pregunta el alcance antes de lanzar jueces.

## Reglas

- Lanza dos jueces ciegos con el mismo objetivo y los mismos criterios.
- No permitas que el juez A vea la salida del juez B, ni al revés.
- Espera a ambos jueces antes de sintetizar.
- No revises tú el objetivo como sustituto de los jueces.
- Trata un hallazgo como confirmado solo si ambos jueces identifican el mismo failure mode.
- Trata hallazgos de un solo juez como sospechosos; repórtalos, pero no hagas auto-fix.
- Trata contradicciones como puntos de escalación.
- Pide permiso antes de aplicar fixes de ronda 1 salvo que el usuario haya preaprobado corregir hallazgos confirmados.
- Después de cualquier fix, vuelve a ejecutar ambos jueces antes de aprobar.
- Los estados terminales son solo `JUDGMENT: APPROVED` o `JUDGMENT: ESCALATED`.

## Selección De Jueces

Usa el mismo perfil para ambos jueces en una ejecución:

| Objetivo / riesgo | Perfil de juez |
|---|---|
| Código general o refactor | revisión directa de `ms-architect`; esta skill es N/A salvo que el usuario indique dos especialistas disponibles |
| Seguridad, auth, permisos, secretos, datos sensibles, dependencias, infra expuesta | dos tareas `ms-security-auditor` |
| Riesgo mixto de seguridad + general | ejecuta primero el par de seguridad; luego un par general solo si sigue haciendo falta |

Incluye únicamente criterios que correspondan al riesgo real. No conviertas tamaño en riesgo ni uses `ms-scout` como juez: su rol es exploración y blast radius.

## Severidad

Usa esta rúbrica al sintetizar:

| Severidad | Significado |
|---|---|
| `CRITICAL` | Pérdida de datos, fallo de seguridad, contrato público roto o comportamiento bloqueante en producción |
| `WARNING (real)` | El uso normal previsto puede disparar el fallo |
| `WARNING (theoretical)` | Requiere condiciones forzadas, imposibles, maliciosas o no soportadas |
| `SUGGESTION` | Mejora de claridad o mantenibilidad que no bloquea corrección |

Degrada warnings teóricos a info salvo que el usuario pida hardening exhaustivo.

## Pasos

1. Define objetivo, criterios, perfil de juez y si los fixes están preaprobados.
2. Lanza juez A y juez B independientemente con objetivo y criterios idénticos.
3. Sintetiza en buckets: confirmado, sospechoso, contradicción e info.
4. Si hay `CRITICAL` confirmado o `WARNING (real)` confirmado, pregunta antes de corregir salvo preaprobación.
5. Delega fixes solo para issues confirmados, usando el agente capaz más estrecho.
6. Vuelve a ejecutar ambos jueces después de los fixes.
7. Detente tras aprobación, escalación o dos iteraciones de fix con issues confirmados restantes; si sigue sin resolverse, pregunta al usuario si continúa.

## Prompt Para Jueces

```text
Eres Judge <A|B> en una revisión de doble juez ciego.

Objetivo:
<archivos, diff, TDD/spec, feature slice o architecture slice>

Criterios de revisión:
<lentes y riesgos específicos>

Reglas:
- Solo hallazgos; sin elogios.
- No asumas hechos que no estén en objetivo/contexto.
- Clasifica severidad como CRITICAL, WARNING (real), WARNING (theoretical) o SUGGESTION.
- Un WARNING es real solo si el uso normal previsto puede dispararlo.

Devuelve:
- Título del hallazgo
- Severidad
- Archivo/ruta/sección y línea si aplica
- Failure mode
- Por qué importa
- Intención de fix sugerida
```

## Contrato De Salida

Devuelve:

```text
## Judgment Day - <objetivo>

Ronda: <n>
Perfil de juez: <especialista explícito | ms-security-auditor>
Criterios: <lentes/categorías>

| Hallazgo | Juez A | Juez B | Severidad | Estado |
|---|---|---|---|---|
| <failure mode> | si/no | si/no | <severidad> | Confirmado/Sospechoso/Contradiccion/Info |

Confirmados:
- <items o ninguno>

Sospechosos:
- <items o ninguno>

Contradicciones:
- <items o ninguno>

Correcciones aplicadas:
- <items o ninguno>

Re-juicio:
- <resultado o pendiente>

JUDGMENT: APPROVED | ESCALATED
```

Aprobado significa cero `CRITICAL` confirmados y cero `WARNING (real)` confirmados. Pueden quedar hallazgos sospechosos, warnings teóricos y sugerencias si se reportan con claridad.
