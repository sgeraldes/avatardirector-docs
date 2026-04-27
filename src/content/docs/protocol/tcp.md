---
title: TCP protocol
description: Wire format for commands and streaming audio on port 4500.
---

The avatar accepts a single TCP connection on port `4500` (override with `-AvatarPort=N` on the game command line). A second concurrent connection is rejected — the backend is expected to drop and reconnect, not multiplex.

## Frame format

Every frame on the wire has the same shape:

<div class="ad-frame">
  <div class="ad-frame__row">
    <div class="ad-frame__cell ad-frame__cell--cyan">
      <div class="ad-frame__eyebrow ad-frame__eyebrow--cyan">1 byte</div>
      <div class="ad-frame__name">Type</div>
    </div>
    <div class="ad-frame__cell ad-frame__cell--violet">
      <div class="ad-frame__eyebrow ad-frame__eyebrow--violet">4 bytes LE</div>
      <div class="ad-frame__name">Payload length N</div>
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

| Type | Payload | Meaning |
|---|---|---|
| `0` | raw PCM | Audio chunk (48 kHz, signed 16-bit little-endian, mono). |
| `1` | UTF-8 JSON | Command — emotion, microexpression, gesture, gaze, config, listen, stop, reset. |

There is no acknowledgement frame. The backend produces, the avatar consumes. Backpressure is provided by the audio ring buffer, not by handshake.

## Audio frames (Type `0`)

- **Sample rate:** 48000 Hz, exactly. Other rates are rejected at the lip-sync layer with a compliance warning.
- **Sample format:** signed 16-bit little-endian.
- **Channels:** 1 (mono).
- **Encoding:** raw PCM bytes — no WAV/MP3/Opus header.

For the chunk-cadence and silence semantics, see [Lip-sync settings](./lipsync-settings).

## Command frames (Type `1`)

The payload is a single UTF-8 JSON object. Examples:

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

Every command is dispatched onto the game thread before any animation state is read or written. Backends do not need to think about UE threading rules — produce JSON, send the frame, the engine does the rest.

## What the backend never sends

- Resampled audio in any format other than 48 kHz mono 16-bit LE.
- Multiplexed channels.
- Concurrent connections from the same host.
- Frames with `Type` outside `{0, 1}`. The TCP worker drops them without dispatching.

## See also

- [Lip-sync settings](./lipsync-settings) — the long-form integrator reference for the audio stream.
- [Session lifecycle](./session-lifecycle) — when sessions start and end, and how `listen` / `stop` / `reset` interact.
