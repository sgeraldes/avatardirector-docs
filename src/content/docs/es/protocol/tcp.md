---
title: Protocolo TCP
description: Formato de cable para comandos y streaming de audio en el puerto 4500.
---

El avatar acepta una sola conexión TCP en el puerto `4500` (override con `-AvatarPort=N` en la línea de comandos del juego). Una segunda conexión concurrente se rechaza — el backend debe cerrar y reconectar, no multiplexar.

## Formato del frame

Cada frame en el cable tiene la misma forma:

<div class="ad-frame">
  <div class="ad-frame__row">
    <div class="ad-frame__cell ad-frame__cell--cyan">
      <div class="ad-frame__eyebrow ad-frame__eyebrow--cyan">1 byte</div>
      <div class="ad-frame__name">Tipo</div>
    </div>
    <div class="ad-frame__cell ad-frame__cell--violet">
      <div class="ad-frame__eyebrow ad-frame__eyebrow--violet">4 bytes LE</div>
      <div class="ad-frame__name">Largo payload N</div>
    </div>
    <div class="ad-frame__cell ad-frame__cell--mint">
      <div class="ad-frame__eyebrow ad-frame__eyebrow--mint">N bytes</div>
      <div class="ad-frame__name">Payload</div>
    </div>
  </div>
  <div class="ad-frame__offsets">
    <div>offset 0</div>
    <div>offset 1</div>
    <div>offset 5 → 5 + N</div>
  </div>
</div>

| Tipo | Payload | Significado |
|---|---|---|
| `0` | PCM crudo | Chunk de audio (48 kHz, 16-bit signed little-endian, mono). |
| `1` | JSON UTF-8 | Comando — emoción, microexpresión, gesto, mirada, config, listen, stop, reset. |

No hay frame de acknowledgement. El backend produce, el avatar consume. La contrapresión la da el ring buffer de audio, no un handshake.

## Frames de audio (Tipo `0`)

- **Sample rate:** 48000 Hz, exacto. Otros rates se rechazan en la capa de lip-sync con un warning de compliance.
- **Formato:** 16-bit signed little-endian.
- **Canales:** 1 (mono).
- **Encoding:** bytes PCM crudos — sin header WAV/MP3/Opus.

Cadencia de chunks y semántica de silencio: ver [Ajustes de lip-sync](./lipsync-settings).

## Frames de comando (Tipo `1`)

El payload es un objeto JSON UTF-8. Ejemplos:

```json
{ "type": "emotion", "name": "joy", "intensity": 0.8 }
{ "type": "microexpression", "name": "smirk" }
{ "type": "anim_gesture", "name": "greet" }
{ "type": "look_at", "target": "camera" }
{ "type": "config", "key": "lipsync_chunk_size", "value": 480 }
{ "type": "listen", "value": 1 }
{ "type": "stop", "target": "speaking" }
{ "type": "reset" }
```

Cada comando se despacha al game thread antes de leer o escribir estado de animación. El backend no necesita pensar en threading de UE — produce JSON, envía el frame, el motor se encarga del resto.

## Lo que el backend nunca envía

- Audio resampleado a un formato distinto de 48 kHz mono 16-bit LE.
- Canales multiplexados.
- Conexiones concurrentes desde el mismo host.
- Frames con `Tipo` fuera de `{0, 1}`. El worker TCP los descarta sin despachar.

## Ver también

- [Ajustes de lip-sync](./lipsync-settings) — referencia larga para integradores del stream de audio.
- [Ciclo de vida de la sesión](./session-lifecycle) — cuándo empieza y termina una sesión, y cómo interactúan `listen` / `stop` / `reset`.
