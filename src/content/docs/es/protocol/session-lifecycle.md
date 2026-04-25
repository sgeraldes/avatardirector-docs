---
title: Ciclo de vida de la sesión
description: Cómo interactúan `reset`, `listen`, `stop` y la sesión ONNX de lip-sync, y cómo elegir el comando correcto para cada caso.
---

**Audiencia:** ingenieros backend integrando con el protocolo TCP de AvatarDirector en el puerto 4500.

Este documento explica qué hace exactamente cada uno de `reset`, `listen`, `stop` a nivel del motor del avatar, cómo el ciclo de vida de la sesión ONNX de lip-sync interactúa con todos ellos, y cómo elegir el comando correcto para cada caso.

---

## TL;DR

- `reset` es el único comando que **destruye el generador de lip-sync ONNX**. También vacía la cola de audio y zerea el estado del motor. Usalo cuando necesitás reinicialización dura.
- `listen` es un comando de **mirada y atención**. No toca la cola de audio, la sesión de lip-sync ni el ONNX. Le dice al avatar "el usuario está hablando ahora, mostrate atento".
- `stop` es una **pausa** — el audio se congela mid-stream, la sesión ONNX queda viva, no se limpia ningún estado. El siguiente paso después de `stop` es o `reset` (drop everything) o más audio (resume).
- El ONNX **también se destruye automáticamente** en el timeout natural de silencio (default 2 s sin audio en `Speaking`). Así que en operación steady-state no hace falta mandar `reset` entre cada enunciado — el motor lo hace por vos.
- `reset` y `listen` son **ortogonales**. Mandar uno no implica el otro. El patrón común entre turnos `reset` + `listen` son dos decisiones distintas (limpiar estado, después señalar atención) que casualmente se mandan juntas.

---

## Ciclo de vida de la sesión de lip-sync

Cada enunciado está enmarcado por una "sesión de lip-sync" — la duración durante la cual el hidden state del ONNX tiene sentido.

**Apertura:** el primer chunk de audio después de `Idle` abre una sesión. El generador interno construye una instancia de runtime ONNX, carga el modelo (estándar o variante Mood), y empieza a correr inferencia sobre el PCM streameado.

**Cierre:** la sesión termina — y el ONNX se libera — en cinco lugares:

1. Shutdown del editor / transición de nivel.
2. Guarda contra corrupción mid-session dentro del handler de audio (defensa contra PCM malformado).
3. Aterrizaje directo en `Idle` mientras había una sesión activa.
4. `Transitioning → Idle` completado.
5. `reset` explícito desde el backend (o `reset` con `target:"speaking"`).

Los casos 3 y 4 son las rutas de cierre natural: estando en `Speaking`, el motor mide `TimeSinceLastAudio`, y cuando supera `SilenceTimeoutSeconds` (default 2.0 s), la máquina de estados cae a `Idle` y la sesión cierra. El caso 5 es el único teardown manejado por el backend.

**¿Por qué destruir el ONNX entre enunciados?** El hidden state del enunciado N puede filtrar sesgo de fonemas a los primeros ~100 ms del enunciado N+1. El generador es barato de reconstruir (una carga de modelo, warmup sub-100 ms) y la frescura vale el costo. Sesiones long-lived también drift en formas observables bajo edge cases específicos — el incidente de stutter LS-009 reportado en el campo se trazó a estado ONNX viejo interactuando con comandos rápidos de emoción, y el fix fue asegurarse de que las rutas de destroy efectivamente disparen.

Entonces en la práctica: cada enunciado tiene su propia sesión ONNX, la sesión cierra deterministicamente, y el siguiente enunciado arranca limpio. El backend rara vez necesita manejar esto — sólo cuando se quiere overridear el ciclo natural.

---

## Las cuatro intenciones del backend — versión larga

Lo que sigue es una sección por cada "quiero hacer..." común desde el backend, con el comando correcto, el formato de cable, qué pasa realmente, qué le pasa al ONNX, y un ejemplo.

### 1. Tirar el ONNX, vaciar audio, dejar todo listo para el siguiente enunciado

**Comando:** `reset` (full, sin target).

```python
sock.send(make_packet(1, json.dumps({"type": "reset"}).encode("utf-8")))
```

Este es el comando más pesado del protocolo. El reset full ejecuta cada bloque de reset en secuencia:

- **Bloque speaking:** limpia el flag de paused-speaking, reanuda audio si estaba congelado por un `stop` previo, drena cualquier sample PCM en cola, y — si había sesión activa — la cierra y **destruye el generador de lip-sync**. También transmite un evento de session-ended para que cualquier generador externamente bound también haga teardown. Esto es el kill del ONNX.
- **Bloque emotion:** baja la emoción actual a Neutral, limpia las curvas target de emoción, aplica Neutral vía ZenDyn si está activado.
- **Bloque expression:** limpia el set activo del motor de microexpresiones.
- **Bloque gesture:** detiene cualquier montage de gesto activo con el blend-out time configurado.
- **Bloque gaze:** centra el target de look-at, zerea el offset de cabeza y el eye aim, snapea la FSM de gaze autónoma a Engaged, drop a listening mode, limpia el contador de disengagement, y limpia el cache off-camera de Drifting para que la FSM no pueda saltar a un target viejo en el próximo tick.
- **Bloque head:** zerea la rotación de cabeza y los cuatro rotators de capa de cabeza (gesture, idle, drift, look-at).
- **Finalización del reset full:** zerea cada curva facial, limpia cada flag de pausa (así el avatar queda totalmente responsive de nuevo, no atorado en estado congelado), y lleva la máquina de estados a `Idle`.

Después de todo eso, el siguiente chunk de audio (a) abre una nueva sesión, (b) construye un nuevo generador con hidden state fresco de ONNX, (c) empieza a streamear visemas. La latencia desde el primer sample al primer visema es el warmup del modelo — típicamente menos de 100 ms con la config default `Standard / SemiOptimized`.

**Cuándo usarlo:** entre turnos de conversación cuando querés un punto de partida known-clean, o después de una pausa larga donde sospechás que la FSM de gaze autónoma derivó a algún lado feo, o como acción de recuperación para una animación atorada. **Lo que cuesta:** la latencia de warmup ONNX para el siguiente enunciado, el snap visual al centro de cabeza y ojos, y un round-trip de la máquina de estados por Idle.

Si sólo necesitás el teardown de lip-sync y querés dejar gaze, emoción y cabeza intactos, mandá la forma con target:

```python
sock.send(make_packet(1, json.dumps(
    {"type": "reset", "target": "speaking"}
).encode("utf-8")))
```

El target "speaking" pega sólo en el bloque speaking de arriba — flush de audio, fin de sesión, destroy de ONNX, estado a Idle — y deja todo lo demás como está. Esta es la opción correcta cuando querés interrumpir el enunciado actual sin alterar el readout emocional o postural del avatar.

---

### 2. Señalar "el usuario dejó de hablar, estoy escuchando atentamente"

**Comando:** `listen` (o equivalente, la clave de config `listening_mode`).

```python
sock.send(make_packet(1, json.dumps({"type": "listen"}).encode("utf-8")))
```

Listening mode setea el flag de listening, resetea el contador de disengagement (así la gaze autónoma no deriva fuera de la cámara mientras el usuario habla), cancela cualquier paso de re-engage en proceso, y corre una variante de re-engage — eligiendo una de 12 coreografías ponderadas (head tilt sutil, brow raise, eye micro-saccade) afinadas para "estoy prestando atención". Después lockea la FSM de gaze autónoma en Engaged por ~3.5 s para que no pueda derivar durante la playback de la variante.

Ese es todo el alcance. La sesión de lip-sync no se toca. La cola de audio no se vacía. El generador de lip-sync no se destruye. Si el avatar estaba mid-Speaking cuando mandaste `listen`, el speaking continúa — `listen` no lo interrumpe. Las 12 variantes sólo corren en el canal de gaze/cara; no se apilan sobre la articulación de boca.

La forma equivalente de config es:

```python
sock.send(make_packet(1, json.dumps(
    {"type": "config", "key": "listening_mode", "value": 1}
).encode("utf-8")))
```

Usá la que te quede más cómoda en tu tabla de dispatch — son idénticas a nivel motor.

**Cuándo usarlo:** al inicio de un turno del usuario (apertura de micrófono / VAD detecta voz / push-to-talk apretado). El avatar va a proyectar atención visiblemente. Si el audio de la propia respuesta del avatar todavía está en la cola cuando el usuario empieza a hablar, podés mandar `reset` (target `speaking`) antes de `listen` para cortar al avatar limpiamente — ver el patrón "wipe and listen" abajo.

**Una interacción sutil:** listening mode se limpia automáticamente apenas llega audio nuevo (cuando `bAutoExitListeningOnSpeech` es true, el default). Así que normalmente no necesitás cancelar `listen` explícitamente — mandar el audio de respuesta del avatar lo cancela como side effect. La cancelación explícita sólo hace falta si querés salir de listening mode sin mandar audio (por ejemplo, el turno del usuario timeoutea y vas a quedarte en silencio).

---

### 3. Cancelar listen mode sin teardown

**Comando:** la clave de config `listening_mode` con valor `0`.

```python
sock.send(make_packet(1, json.dumps(
    {"type": "config", "key": "listening_mode", "value": 0}
).encode("utf-8")))
```

Esto limpia el flag de listening y resetea el estado de disengagement. Eso es todo. La FSM de gaze autónoma reanuda su ciclo normal Engaged → Drifting → Introspective → ReEngaging. No pasa ningún teardown.

Intencionalmente no hay forma `{"type": "listen", "value": 0}` — `listen` es fire-and-forget (elige una variante y la corre). La salida es por la clave de config.

**Cuándo usarlo:** el turno del usuario terminó sin habla (timeout, push-to-talk soltado sin audio), y querés que el avatar deje de proyectar "estoy escuchando" antes del siguiente evento. En la mayoría de backends conversacionales no vas a necesitar esto — el auto-exit on speech (§2) cubre el caso común.

**Lo que esto NO es:** esto no es una forma de terminar el habla del avatar. La playback del audio del avatar queda intacta. Si querés terminar el habla, ver §6 abajo.

---

### 4. Pausar el habla sin tirar la sesión

**Comando:** `stop` con target `speaking`.

```python
sock.send(make_packet(1, json.dumps(
    {"type": "stop", "target": "speaking"}
).encode("utf-8")))
```

Esto setea un flag de paused-speaking y congela el audio mid-stream — el último sample reproducido se mantiene — y no se sacan más samples de la cola. La sesión de lip-sync **no** termina. El flag de sesión queda true. El generador ONNX queda vivo en memoria con el hidden state intacto.

Esto es significativo porque el watchdog de silence-timeout sólo cuenta `TimeSinceLastAudio`. Mientras está pausado, no llega audio, así que `TimeSinceLastAudio` sigue subiendo. Después de 2 segundos (default `SilenceTimeoutSeconds`), el watchdog va a tirar la sesión igual, exactamente como lo haría con silencio natural. Así que `stop` es una pausa de ventana corta — útil para patrones tipo "esperá, el usuario interrumpió" donde podés reanudar en uno o dos segundos — pero no es un hold de largo plazo.

**Reanudar desde `stop`:** el siguiente chunk de audio entrante no despausa automáticamente. O mandás `reset target:"speaking"` (limpia el flag de pausa, vacía la cola, termina la sesión — el siguiente audio arranca un enunciado nuevo), o mandás un comando follow-up que reanude explícitamente. En la práctica el patrón más limpio es "si querés reanudar, en realidad querés un enunciado fresco" — entonces la ruta de resume es `reset target:"speaking"` seguido del nuevo stream de audio.

**Otros targets de `stop`** (`emotion`, `expression`, `gesture`, `gaze`, `head`, y el multi-system `moving`) comparten la misma semántica: pausar al writer de ese subsistema en su valor actual. Ninguno toca la sesión de lip-sync. Las variantes con target son útiles para escenas interactivas ("congelá el gesto pero mantené la cara expresiva") pero rara vez se necesitan en un backend de chat.

---

### 5. Interrumpir un enunciado largo inmediatamente

**Comando:** `reset` con target `speaking`.

```python
sock.send(make_packet(1, json.dumps(
    {"type": "reset", "target": "speaking"}
).encode("utf-8")))
```

Este es el handler de "barge-in" de manual. El avatar está mid-enunciado, el usuario empieza a hablar, tu VAD/turn-detector decide cortarlo. El `reset speaking` con target (a) vacía inmediatamente la cola de audio (el sample actual termina de salir del buffer, pero no se saca nada más), (b) cierra la sesión de lip-sync, (c) destruye el generador ONNX, (d) baja la máquina de estados a Idle. La boca se cierra en uno o dos frames. El cuerpo, gaze y emoción del avatar no se alteran.

Si además querés señalar la atención del turno del usuario, seguilo con `listen`:

```python
sock.send(make_packet(1, json.dumps(
    {"type": "reset", "target": "speaking"}
).encode("utf-8")))
sock.send(make_packet(1, json.dumps({"type": "listen"}).encode("utf-8")))
```

Los dos son independientes — no hay un solo comando "barge-in" en el protocolo porque la decisión de gaze y la decisión de audio son separadamente útiles.

**¿Por qué no mandar un `reset` full?** El reset full zerea cabeza y gaze también, lo que produce un snap visible al centro. Para una interrupción conversacional, ese snap es molesto — el avatar tiene que verse como que dejó de hablar porque el usuario habló, no como que lo teleportaron. Con la forma con target el estado postural queda intacto.

---

### 6. Recuperarse de un mal estado conocido a mitad de sesión

**Comando:** `reset` full.

```python
sock.send(make_packet(1, json.dumps({"type": "reset"}).encode("utf-8")))
```

Esta es la escotilla de recuperación. Si algo sale mal durante una sesión larga — lag visible de boca, emoción atorada, gaze incorrecta, gesto congelado — `reset` full es la forma determinista de volver a un estado known-good. Zerea cada canal y lleva a Idle. El siguiente comando arranca de cero.

El incidente LS-009 es el caso de estudio canónico. Reportes de campo describían que la boca del avatar se ponía lenta durante sesiones largas de Shipping con tráfico rápido de emociones. La mitigación del lado del usuario era un triplete manual `stop → reset → emotion:neutral`, que restauraba inmediatamente el comportamiento normal. El fix de motor (serie LS-009) eliminó la causa subyacente, pero la escotilla de recuperación sigue válida para cualquier clase futura de issues.

**No deberías necesitar esto seguido.** Si tu backend está mandando `reset` más de una vez por minuto en carga normal, algo anda mal upstream — investigá antes de meter el workaround. El steady-state sano es: el silence-timeout cierra sesiones automáticamente, tu backend casi nunca manda `reset`.

---

### 7. El combo "wipe and listen" — entre turnos de conversación

**Patrón:** mandar `reset` inmediatamente seguido de `listen`.

```python
sock.send(make_packet(1, json.dumps({"type": "reset"}).encode("utf-8")))
sock.send(make_packet(1, json.dumps({"type": "listen"}).encode("utf-8")))
```

Este es el dispatch entre turnos más común en un backend de chat típico: "el usuario está por hablar, drop everything del último enunciado del avatar, después señalá atención". Los dos comandos son ortogonales pero co-ocurren seguido, que es lo que motivó este doc.

**El orden importa un poco.** Mandar `listen` antes que `reset` significa que el reset va a limpiar el flag de listening (el bloque de gaze lo setea a false), deshaciendo el listen — habría que volver a mandar `listen`. Mandar `reset` primero, después `listen`, deja al avatar en `Idle` con listening mode true, que es el estado correcto para "listo y atento".

**Una alternativa más liviana:** si el enunciado anterior ya terminó naturalmente (el silence-timeout cerró la sesión, el avatar está en Idle, el ONNX ya está destruido), el `reset` no agrega nada y podés saltearlo:

```python
sock.send(make_packet(1, json.dumps({"type": "listen"}).encode("utf-8")))
```

En la práctica es más seguro mandar siempre `reset` primero (es idempotente — no hace daño si no hay nada que resetear) que trackear estado del lado del backend. El costo es despreciable.

---

## Anti-patrones

Una lista corta de cosas que parecen que deberían funcionar pero no, o que funcionan pero te cuestan algo.

**Mandar `reset` después de cada enunciado "por las dudas".** Innecesario. El silence-timeout maneja el destroy automáticamente. Mandar `reset` arriba fuerza un round-trip inmediato de la máquina de estados y un snap visible a default de cabeza/gaze si usaste la forma full. Usá `reset speaking` con target si genuinamente necesitás interrumpir; si no, dejá que el motor cierre la sesión.

**Usar `stop` como pausa de largo plazo.** `stop` sólo congela audio; no congela el watchdog de silence-timeout. Después de 2 segundos pausado, la sesión termina naturalmente. Si querés un hold de largo plazo del avatar, necesitás un modelo distinto — no hay comando de "pausa indefinida" en el protocolo porque el avatar está diseñado para latencia conversacional, no para control de playback.

**Mandar `listen` para terminar el habla del avatar.** `listen` es sólo gaze y atención. La playback del propio audio del avatar sigue saliendo. Para terminar el habla usá `reset speaking` (limpio) o `stop speaking` (congelado, expira después del silence-timeout).

**Mandar `listening_mode:0` para interrumpir el habla del avatar.** Mismo problema que arriba — `listening_mode:0` sólo limpia el flag de listening y resetea el contador de disengagement. No hace nada al audio, al lip-sync ni al ONNX. Usá `reset speaking`.

**Tratar `reset` y `listen` como un solo concepto.** Son independientes. Un borde de turno de usuario es una decisión del backend compuesta de dos decisiones separadas del lado del avatar: (1) qué hacer con el estado anterior del avatar, (2) qué postura proyectar para el nuevo turno. La mayoría de backends quieren `reset` + `listen`, pero el protocolo los expone separados porque algunos backends quieren sólo uno (por ejemplo, un test harness driven por TTS que nunca entra a listening mode).
