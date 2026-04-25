---
title: Ajustes de lip-sync
description: Formato de audio obligatorio, framing TCP y claves de configuración del lip-sync para integradores TTS.
---

**Audiencia:** mantenedores backend / DevOps que están conectando un stream realtime de TTS (ElevenLabs u otro) al puerto TCP del AvatarDirector.

Este documento es la referencia corta y directa de "qué tiene que mandar mi backend y cómo lo afino." Si algo acá no coincide con el comportamiento real del plugin corriendo, el plugin gana — abrí un issue.

---

## 1. Formato de audio — innegociable

Mandá PCM **exactamente** así:

| Propiedad | Valor |
|---|---|
| Sample rate | **48000 Hz** |
| Formato | **16-bit signed little-endian** |
| Canales | **1 (mono)** |
| Encoding | PCM crudo (sin header WAV/MP3/Opus) |

Los streams realtime de ElevenLabs por defecto son MP3 / PCM 16 kHz / PCM 22050; **ninguno funciona directo**. Tu backend tiene que resamplear / decodificar a 48 kHz mono 16-bit LE antes de mandar.

Para ElevenLabs específicamente: pedí `output_format=pcm_24000` o `pcm_22050`, después resampleá en el backend con `numpy` / `scipy.signal.resample_poly` / `librosa.resample` / `audioresample` a 48 kHz antes del socket. **No** intentes setear `output_format=pcm_48000` — esa ruta es PCM encoded, no crudo, y se comporta inconsistente entre voces.

Si el formato está mal, el avatar va a reproducir audio basura (rate mismatch) o no va a hacer lip-sync (NaN trap dentro del log-mel ONNX — el threshold de silencio atrapa frames de zero obvios pero no PCM malformado).

---

## 2. Framing TCP — innegociable

Una conexión TCP por avatar, puerto **4500** por defecto (override con `-AvatarPort=N` en la línea de comando del juego).

Cada frame:

```text
┌────────┬──────────────────┬─────────────────┐
│ 1 byte │ 4 bytes LE       │ N bytes         │
│ Tipo   │ Largo payload N  │ Payload         │
└────────┴──────────────────┴─────────────────┘
```

| Tipo | Payload | Significado |
|---|---|---|
| `0` | bytes PCM crudos | Chunk de audio (debe cumplir §1). |
| `1` | JSON UTF-8 | Comando (emoción / microexpresión / config / etc — ver [Protocolo TCP](/es/protocol/tcp)). |

Una segunda conexión al mismo puerto se rechaza — cerrá y reconectá; no multiplexes.

### 2.1 Cadencia recomendada de chunks de audio

- **Tamaño de chunk:** 1920–4800 bytes por frame (≈10–25 ms de audio a 48 kHz mono 16-bit). Más chico también está bien; el ring buffer (200 ms de capacidad) absorbe jitter.
- **Velocidad de envío:** tan rápido como el TTS produzca. No paces artificialmente — el ring buffer drena en tiempo real y aplica su propia contrapresión.
- **Señal de contrapresión:** si la cola de audio se desborda vas a ver warnings `[Audio]` en el panel de depuración. Si los ves sostenidos, tu TTS está produciendo más rápido que 48 kHz wall-clock. Casi siempre es un bug de clock skew / rate de resampleo en el backend.

> **Panel de depuración — apagado por defecto.** El panel está deshabilitado en todas las builds. Para ver warnings `[Audio]` en vivo, activalo para la sesión: `-DebugOverlay` en la línea de comandos, o `{"type":"config","key":"debug_overlay","value":1}` por TCP. Los mismos warnings se persisten al log de Shipping si el logging está activado.

### 2.2 Qué entiende el lip-sync por "silencio"

Tratamos samples bajo ~5e-4 absoluto (~-66 dBFS) como silencio y los salteamos en la ruta ONNX (NaN-guard contra log-mel underflow). Mandá silencio real (zeros o ruido cerca de cero) sin problema — el audio igual se reproduce, sólo sin movimiento espurio de boca.

### 2.3 Borde de oración / nuevo enunciado

El director auto-detecta bordes de oración usando un gap de silencio. Default: **0.5 s** sin audio (`NewUtteranceGapSeconds`). Cuando detecta el gap, se recicla la sesión ONNX (hidden state fresco para la próxima oración). No hace falta mandar `reset` entre enunciados a menos que quieras cortar antes — el detector de gap es el mecanismo normal.

Si tu TTS produce salida multi-oración sin gaps, el director trata todo el stream como un solo enunciado y sólo resetea cuando el audio efectivamente para por ≥0.5 s o pasa el `SilenceTimeoutSeconds` (2.0 s), llevando al avatar a Idle.

---

## 3. Claves de config de lip-sync que podés streamear

Mandá vía JSON tipo 1: `{"type":"config","key":"<nombre>","value":<v>}`. Todas son live a menos que se aclare.

### 3.1 Selección de modelo

| Clave | Valores | Cuándo usarlo |
|---|---|---|
| `lipsync_model_mode` | `"standard"`, `"original"`, `"mood"` | Standard = más rápido, default. Original = mejor calidad, más CPU. Mood = condicionado por mood (ver §3.3). |
| `lipsync_optimization` | `"highly_optimized"`, `"semi_optimized"`, `"original"` | Sólo modo standard. Trade-off de calidad vs CPU. |

Cambios de modo y optimización reconstruyen la sesión ONNX en el próximo enunciado (~20 ms de rebuild caliente — invisible end-to-end).

### 3.2 Performance / presupuesto de CPU

| Clave | Default (cloud) | Default plugin | Notas |
|---|---|---|---|
| `lipsync_chunk_size` | **640** | 160 | Más grande = menos CPU, boca un poco menos responsive. 640 está afinado para CPU compartida en cloud a 30 FPS; bajalo a 160 en hardware dedicado si querés máxima respuesta. Live-writable. |
| `lipsync_intra_threads` | **2** | 0 (auto) | Pool intra-op de ONNX. Limitado a 2 para dejar CPU al encoder de Pixel Streaming. Sólo session-init — aplica en el próximo enunciado. |
| `lipsync_inter_threads` | **1** | 0 (auto) | Misma razón. Sólo session-init. |

En hardware dedicado de un solo tenant, seteá `lipsync_chunk_size = 160`, `lipsync_intra_threads = 0`, `lipsync_inter_threads = 0` para volver al auto-tune del plugin.

### 3.3 Sólo modelo Mood (`lipsync_model_mode = "mood"`)

| Clave | Default | Rango | Notas |
|---|---|---|---|
| `lipsync_mood` | `"neutral"` | `neutral / happy / sad / disgust / anger / surprise / fear / confident / excited / bored / playful / confused` | Etiqueta de mood actual. |
| `lipsync_mood_intensity` | 1.0 | 0.0 – 1.0 | Cuánto sesga el mood la boca/cara. 0 = básicamente neutral. |
| `lipsync_lookahead_ms` | 80 | 20 – 200 (múltiplo de 20) | Más alto = mejor sync, más latencia. |
| `lipsync_output_type` | `"full_face"` | `"full_face"` o `"mouth_only"` | Mouth-only es más barato si no necesitás cejas / ojos / cachetes desde el lip-sync. |

### 3.4 Fine-tuning de curvas (live, sin rebuild)

Equivalen a la receta oficial "Fine-Tuning Lip Sync Behavior" pero plegada al plugin para que no tengas que cablear un nodo Modify Curve en el AnimGraph.

| Clave | Default | Rango | Qué hace |
|---|---|---|---|
| `lipsync_jaw_open_scale` | 1.0 | 0.0 – 2.0 | Multiplica `CTRL_expressions_jawOpen` después de que el generador la escribe. Usá < 1 para amortiguar boca muy abierta en TTS fuerte / excitado. |
| `lipsync_tongue_out_scale` | 1.0 | 0.0 – 2.0 | Multiplica `CTRL_expressions_tongueOut`. Usá < 1 si la lengua se ve exagerada de cerca. |

Rangos probados en campo:

| Síntoma | Probá |
|---|---|
| Modelo Mood + TTS fuerte — mandíbula muy abierta en vocales acentuadas. | `lipsync_jaw_open_scale = 0.85 – 0.95` |
| Pixel Streaming portrait — lengua se lee exagerada en /th/ /l/ /n/. | `lipsync_tongue_out_scale = 0.7 – 0.85` |

---

## 4. Perfil inicial recomendado para una integración fresca con ElevenLabs

Mandá esto una vez al iniciar la sesión (o ponelo como default en el componente avatar desde el editor):

```json
{"type":"config","key":"lipsync_model_mode",       "value":"mood"}
{"type":"config","key":"lipsync_mood",             "value":"neutral"}
{"type":"config","key":"lipsync_mood_intensity",   "value":0.7}
{"type":"config","key":"lipsync_lookahead_ms",     "value":80}
{"type":"config","key":"lipsync_output_type",      "value":"full_face"}
{"type":"config","key":"lipsync_chunk_size",       "value":640}
{"type":"config","key":"lipsync_jaw_open_scale",   "value":0.92}
{"type":"config","key":"lipsync_tongue_out_scale", "value":0.85}
```

Después manejá `lipsync_mood` desde tu máquina de estado de conversación (matcheando el tono emocional del avatar), y sólo volvé a tocar las escalas / chunk size si algo se ve raro en producción.

---

## 5. Modos de falla comunes

| Síntoma | Causa probable | Fix |
|---|---|---|
| Audio se escucha, boca congelada. | Formato PCM mal (rate, canales, bit depth) o primeros chunks todo zeros. | Verificá §1 con `ffprobe`. Saltá silencio inicial en el backend. |
| Audio se escucha, boca atrasa ~1 s y después se pone al día. | Backend mandando más rápido que wall-clock — clock skew o rate de resampleo errado. | Mirá el panel de warnings `[Audio]`; verificá el rate de salida del resampler. |
| Boca anda 2-3 oraciones bien, después se traba. | Build pre-LS-012 (reúso de generador + corrupción de hidden state ONNX). | Actualizá a build LS-012+. |
| Boca muy abierta en cada sílaba fuerte. | Jaw scale default = 1.0 + modelo Mood. | `lipsync_jaw_open_scale = 0.9`. |
| Lengua distrae a distancia portrait de Pixel Streaming. | Tongue scale default = 1.0. | `lipsync_tongue_out_scale = 0.8`. |
| `[LipSync] Generator rebuilt — settings changed` aparece seguido. | Estás togleando `lipsync_model_mode` / `lipsync_optimization` / `lipsync_intra_threads` / `lipsync_inter_threads` a mitad de sesión. | Seteá esas una vez al iniciar; sólo las claves live (`lipsync_mood*`, `lipsync_chunk_size`, las escalas) están pensadas para tuning en runtime. |

---

## 6. Log de auditoría de compliance

Cada frame TCP que mande tu backend pasa por una auditoría de compliance del lado del avatar. Cualquier desviación de este documento se loguea bajo la categoría dedicada `LogAvatarCompliance` y se muestra en el panel de warnings del overlay de depuración.

> **Panel de depuración — apagado por defecto.** El overlay (y su panel de warnings) está deshabilitado en todas las builds. Para ver warnings de compliance en vivo, activalo para la sesión: `-DebugOverlay` en la línea de comandos, o `{"type":"config","key":"debug_overlay","value":1}` por TCP. Los mismos warnings se persisten al log independiente del estado del overlay.

Filtrá tus logs de sesión con:

```text
LogAvatarCompliance: Warning
```

La auditoría está pensada para darte feedback rápido mientras integrás. Una corrida limpia (formato correcto, claves correctas, valores correctos) produce cero warnings `[Compliance]` y un resumen periódico cada 30 segundos:

```text
[Compliance] === SUMMARY (periodic) ===
[Compliance]   Audio (process):   chunks=4218 bytes=10797568 minChunk=1280 maxChunk=4096 avgChunk=2560 oddAlign=0 silent=12 clipped=0
[Compliance]   Audio (session):   chunks=87 samples=222720 peak=0.872 dcAvg=-0.0021 rateInferred=47984Hz vs expected 48000Hz
[Compliance]   Commands:          malformedJson=0 unknownTypes=0 unknownConfigKeys=0 outOfRangeClamps=0
```

Una corrida sucia te muestra la desviación específica, ejemplo:

```text
[Compliance] Audio rate looks wrong: inferred 22050 Hz vs expected 48000 Hz (>5% off). Backend is sending wrong sample rate or is clock-skewed.
[Compliance] Unknown config key 'lipsync_chunkSize' (#3 total). Payload: {...}. See lipsync-settings docs for the supported key list.
[Compliance] config 'lipsync_lookahead_ms' value 250.0000 out of documented range — clamped to 200.0000.
[Compliance] TCP: Unknown frame type 2 (length 4096). Protocol defines type 0 (audio PCM) and type 1 (JSON command) only. Payload discarded.
```

Cada cierre de sesión (silence timeout, recycle por gap de oración, reset) emite un resumen final para que puedas atribuir los warnings a enunciados específicos. Al shutdown, los totales process-scope se vuelcan una última vez.

Si algo acá no está claro o querés cobertura adicional en la auditoría, abrí un issue — para eso está.

---

## 7. Build stamp

Estas claves y defaults aplican a builds de AvatarDirector con tags LS-013 / LS-014 o posterior. Builds anteriores pueden no tener las escalas de curvas, traer `lipsync_chunk_size = 160` / `lipsync_lookahead_ms = 100`, y carecer enteramente de la categoría `LogAvatarCompliance`. Confirmalo mirando el build stamp en la fila header del overlay de depuración, o mandá `{"type":"config","key":"lipsync_jaw_open_scale","value":1.0}` y mirá el log — builds pre-LS-013 no van a loguear una línea `config:` para esa clave, y builds pre-LS-014 no van a loguear bajo `LogAvatarCompliance`.
