---
name: comment-writer
description: "Escribe comentarios concisos de colaboración para feedback de PR, issues, comentarios de revisión, Slack, GitHub y respuestas de mantenimiento."
---

# Comment Writer

Usa esta skill cuando escribas un comentario que otra persona leerá en un contexto colaborativo.

## Voz

- Empieza por el punto accionable.
- Manténlo corto: normalmente 1-3 párrafos breves o una lista compacta.
- Explica la razón técnica cuando pidas un cambio.
- Comenta el problema de mayor valor, no cada preferencia.
- Separa feedback bloqueante de sugerencias opcionales.
- Sigue el idioma del hilo. En español, usa español neutro/profesional salvo que el hilo tenga otro tono claro.
- Evita elogios performativos, relleno corporativo y recapitulaciones largas.

## Formas

Comentario bloqueante:

```text
Esto bloquea el merge porque <razón>.

El fallo es <impacto específico>. Cambiaría <cosa concreta> para preservar <invariante deseada>.
```

Sugerencia no bloqueante:

```text
No bloqueante: <sugerencia>. Ayuda porque <razón>, pero el enfoque actual es aceptable si <condición>.
```

Actualización de mantenimiento:

```text
Estado: <estado actual>.

Siguiente paso: <owner/acción>. Bloqueo: <solo si existe>.
```

## Barra De Calidad

- Incluye archivo, comportamiento, comando o impacto de usuario cuando sea relevante.
- No uses "parece riesgoso" sin evidencia.
- No escondas severidad: di si bloquea o si es opcional.
