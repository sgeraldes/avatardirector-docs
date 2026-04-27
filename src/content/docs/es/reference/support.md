---
title: Soporte
description: Cómo abrir bugs, pedir features, pedir ayuda y mandar logs.
---

**Audiencia:** cualquiera integrando contra el plugin AvatarDirector o corriéndolo en producción que necesite reportar un bug, pedir una feature, pedir ayuda o entregar datos de diagnóstico.

Si sos cliente final, el canal de contacto que tu equipo acordó en el kickoff de integración manda sobre cualquier cosa de acá abajo.

---

## 1. Antes de abrir nada — triage rápido

Dos minutos de triage te ahorran horas de round-trips. En orden:

1. **¿El smoke test sigue pasando?** Corré el `smoke_test.py` stdlib-only que viene con el plugin contra una sesión PIE o packaged. Ejercita cada tipo de comando y streamea una sinusoidal de 440 Hz por 1.5 s para que la boca flapee al tono. Si el smoke test falla, te imprime exactamente qué paso se rompió — eso ya es el 80% de un buen bug report.
2. **¿DLL del Editor vieja?** Como un tercio de los reportes de "el editor está raro" se trazan a una DLL cacheada después de un cambio de propiedad. Cerrá el editor, recompilá el target Editor, reabrí, reintentá. Si el síntoma se fue, listo.
3. **¿El log de compliance está limpio?** Filtrá tu log Shipping por `LogAvatarCompliance: Warning`. Si la auditoría reporta una desviación (sample rate mal, JSON malformado, clave de config desconocida, valor fuera de rango), el problema está del lado del backend y la línea de log te dice exactamente qué.
4. **¿El build stamp es actual?** La fila header del overlay de depuración muestra el build stamp (ej. `Apr 22 2026 01:13`). Si estás en una build vieja, el bug puede estar arreglado ya — chequeá las [notas de versión](../releases/ls009).

Si después de esas cuatro chequeadas el problema sigue real, abrí un report.

---

## 2. Reportes de bug

Un buen bug report tiene tres cosas: qué viste, qué esperabas, y los artefactos para verificar ambas. Usá este template:

```text
### Resumen
Una oración. Qué se rompió.

### Build stamp
De la fila header del overlay de depuración, o del header del log Shipping.
Ejemplo: Apr 22 2026 01:13

### Entorno
- Plataforma: Windows / EC2 g4dn.xlarge / etc.
- Motor: UE 5.7 source / launcher
- Versión / commit SHA del plugin: (de tu kit de integración)
- Backend / TTS: ElevenLabs realtime, custom, etc.

### Pasos para reproducir
1. ...
2. ...
3. ...

### Comportamiento esperado
Qué tendría que haber pasado.

### Comportamiento real
Qué pasó en cambio. Incluí screenshots / video si es visual.

### Logs
Adjuntá el archivo de log de la sesión afectada (ver §5 abajo para ubicación y packaging).

### Severidad
- Critical: avatar inservible, sin workaround
- High: feature rota, hay workaround
- Medium: cosmético / edge case
- Low: pulido nice-to-have
```

**Abrir en:** el canal acordado en tu contrato de integración, o — para issues de documentación — en el [tracker del repo de docs](https://github.com/sgeraldes/avatardirector-docs/issues/new).

**Lo que hace que un bug se triagee rápido:**

- Una receta de reproducción que no dependa de estado de producción. "Funciona en `smoke_test.py` con estos flags" es mucho más rápido que "pasa a veces después de una sesión larga".
- Logs de una sesión que incluya la falla, no de una corrida sana con la falla descrita de memoria. La auditoría de compliance suele señalar el frame exacto que disparó el issue.
- Build stamp. Sin eso no podemos saber si ya está fixeado.
- Un issue por reporte. "El lip-sync se traba Y la emoción se ve mal Y el TCP se desconecta" son tres reportes.

**Lo que enlentece el triage:**

- Screenshots del avatar sin logs. Vemos el síntoma pero no el por qué.
- "Está roto" sin repro. No podemos arreglar lo que no podemos reproducir.
- Reportes que mezclan varios issues distintos.
- Logs editados / redactados que sacan los timestamps o el header del build stamp. Redactá PII de payloads de mensajes si hace falta, pero dejá el framing intacto.

---

## 3. Pedidos de feature

Un buen feature request explica el problema que querés resolver, no la implementación que querés. Muchas veces tenemos ideas sobre formas mejores de resolverlo que no son visibles desde el lado del integrador.

```text
### Problema
¿Cuál es el problema user-facing? ¿Por qué el comportamiento actual no lo resuelve?
(ej. "El backend quiere que el avatar proyecte modos específicos de atención durante
conversaciones multi-party — el `listen` actual es binario, pero tenemos al menos tres
posturas distintas para expresar: actively-listening, half-attentive, y waiting-to-respond.")

### Solución propuesta (opcional)
Sketch de lo que te gustaría. Lo usamos como input, no como spec.

### Workarounds que probaste
Qué hacés actualmente para esquivar el gap. Nos ayuda a juzgar urgencia.

### Alcance del use case
- ¿Sólo tu deployment, o industria general?
- ¿Qué tan seguido te muerde el gap? Diario, semanal, ocasional?
- ¿Es bloqueador de launch, o item de wishlist?
```

**Cosas que hacen que un feature request aterrice más pronto:**

- Problema user-facing concreto, no "estaría bueno si".
- Un workaround que estás usando — prueba que el gap es real y cuantifica el costo.
- Generalidad entre múltiples use cases.
- Disposición para testear una implementación draft antes de que la liberemos broadly.

**Cosas que no ayudan:**

- Pedir cambios que contradicen restricciones de diseño (un solo cliente TCP a la vez, boca driven por ONNX, cara driven por RigLogic) — esos son fundamentos, no bugs.
- Pedidos vagos de "mejoralo" sin un outcome target.

---

## 4. Pedir ayuda

Si no estás seguro si algo es un bug, un gap de feature o un misuse, simplemente preguntá. Más fácil aclarar en 5 minutos de ida y vuelta que round-trippear por el proceso de bug report.

```text
### Lo que estoy intentando
El objetivo final. No "mandar un comando de config" — "que el avatar se vea atento
mientras el usuario habla por hasta 30 segundos."

### Lo que probé
Los comandos / config que mandaste, o el code path que tomaste.

### Lo que veo
Qué hace el avatar realmente. Logs / video / screenshots.

### Lo que esperaba
Tu modelo mental de qué tendría que pasar. Si tu modelo difiere de los docs,
queremos saberlo — eso es un bug de docs digno de fix.

### Links de docs que ya leíste
Así no te volvemos a apuntar a páginas que ya chequeaste.
```

Para cosas time-sensitive (producción down): usá el canal de escalado prioritario acordado en el contrato de soporte, no el tracker de bugs.

---

## 5. Mandar logs

Sin logs, el soporte post-mortem es esencialmente adivinar.

### 5.1 Dónde viven los logs

| Build | Path del log |
|---|---|
| Shipping (cloud / Pixel Streaming) | `%LOCALAPPDATA%\<NombreProyecto>\Saved\Logs\<NombreProyecto>.log` |
| Development / Editor | `<Proyecto>\Saved\Logs\<NombreProyecto>.log` |
| Backups rotados | `<NombreProyecto>-backup-YYYY.MM.DD-HH.MM.SS.log` (mismo directorio que el log activo) |

Una sesión larga puede rotar el log a mitad de incidente. Incluí siempre el log activo Y los archivos de backup escritos durante la ventana afectada — Unreal rota en cada launch y en ciertos thresholds de tamaño.

### 5.2 Qué tiene un log capture útil

El log incluye:

- Build stamp en el header (qué versión corría)
- Ciclo de vida del socket TCP (`AvatarNetworkManager: Listening on port 4500`, conexión / desconexión del cliente)
- Cada comando recibido (bajo la categoría de log estándar, más `LogAvatarCompliance` para violaciones de protocolo)
- Transiciones de máquina de estado (`Idle` / `Speaking` / `Emoting` / `Transitioning`)
- Ciclo de vida de la sesión de lip-sync (session start, rebuilds del generador, carga del modelo ONNX)
- Warnings de profundidad de cola de audio (categoría `[Audio]`)
- Los warnings de ring-buffer `[Emotion]` / `[LipSync]` / `[Audio]` incluso con el overlay de depuración apagado

### 5.3 Tips para empaquetar

- **Comprimí.** Los logs pueden crecer a varios MB en sesiones largas. Zipeá antes de mandar; nosotros desempaquetamos.
- **Incluí la ventana de timestamp.** Anotá aproximadamente cuándo pasó el issue. Más fácil que escanear miles de líneas.
- **No trunques.** Logs completos son más útiles que excerpts. Si el log full es muy grande para mandar en una pieza, mandá el backup rotado que cubre la ventana del incidente más el siguiente archivo.
- **No redactes el framing.** Si tenés que redactar PII de payloads JSON, reemplazá el contenido de strings con `"<redacted>"` pero dejá la estructura del field intacta — el bug puede estar en el framing, y redactar líneas enteras lo oculta.
- **Incluí también la salida del smoke test** si el issue es reproducible ahí.

### 5.4 Privacidad / redacción

El plugin no loguea PCM crudo de audio. Sí loguea:

- Payloads JSON de comandos (que pueden contener texto user-facing si tu backend lo embebe)
- Valores de mood de lip-sync, nombres de emoción, nombres de microexpresión
- Paths de archivo en la máquina host
- Endpoints de red (la URL de signaling de PixelStreaming se loguea al startup)

Si tu deployment maneja PII (médica, financiera, etc.) y los payloads de comandos incluyen texto sensible, redactá esos payloads antes de compartir. Reemplazá el contenido de los fields `value` / `text` con `<redacted-len-N>` así el framing queda intacto pero el contenido se va. No saques líneas enteras — eso enmascara el contexto que necesitamos para diagnosticar.

---

## 6. La auditoría de compliance (leer si sos integrador de backend)

Cada frame TCP que mande tu backend pasa por una auditoría de compliance. Cualquier desviación del protocolo documentado se loguea bajo `LogAvatarCompliance` y se muestra en el panel de warnings del overlay de depuración.

Filtrá tu log de sesión por `LogAvatarCompliance: Warning` — si el resultado está vacío, tu backend cumple. Si tiene entradas, esos son bug reports pre-clasificados contra tu backend, formateados listos con la desviación específica y la remediación. Mandalos antes de abrir un bug contra el avatar; muchas veces son la respuesta.

Catálogo completo: [Ajustes de lip-sync § Log de auditoría de compliance](../protocol/lipsync-settings#6-log-de-auditoría-de-compliance).

---

## 7. Guía de severidad

Cuando triageamos usamos aproximadamente esta escala. Tu contrato de soporte de cliente puede overridear esto.

| Severidad | Ejemplos | Respuesta |
|---|---|---|
| **P0 — Producción down** | El avatar crashea en cada enunciado; el listener TCP no bindea; el build Shipping no arranca. | Mitigación same-day; root-cause en 48 h. Llegá por el canal prioritario acordado en el contrato de soporte, no por el tracker de bugs. |
| **P1 — Feature crítica rota** | Lip-sync stuck abierto; emociones no aplicando; claves de config específicas ignoradas. | Días, no semanas. Tracker de bugs con label `critical`. |
| **P2 — Feature impaired** | Drift cosmético, races edge-case, artifacts visuales intermitentes. | Próxima release planeada. Tracker de bugs estándar. |
| **P3 — Pulido / nice-to-have** | Wording en un log, ajustes marginales de animación. | Backlog. Tracker de bugs, sin label de urgencia. |
| **F — Feature request** | Capacidad nueva, clave de config nueva, tipo de comando nuevo. | Planning de sprint. Label `enhancement`. |
