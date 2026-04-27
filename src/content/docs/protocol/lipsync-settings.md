---
title: Lip-sync settings
description: Required audio format, TCP framing, and lip-sync configuration keys for TTS integrators.
---

**Audience:** backend / DevOps maintainers wiring an ElevenLabs (or any other realtime TTS) stream into the AvatarDirector TCP port.

This document is the short, direct reference for "what does my backend have to send and how do I tune it." If something here disagrees with what the running plugin does, the running plugin wins — file an issue.

---

## 1. Audio format — non-negotiable

Send PCM in **exactly** this shape:

| Property | Value |
|---|---|
| Sample rate | **48000 Hz** |
| Sample format | **signed 16-bit little-endian** |
| Channels | **1 (mono)** |
| Encoding | raw PCM (no WAV/MP3/Opus header) |

ElevenLabs realtime streams default to MP3 / PCM 16 kHz / PCM 22050; **none of those will work directly**. Your backend must resample / decode to 48 kHz mono 16-bit LE before sending.

For ElevenLabs specifically: pass `output_format=pcm_24000` or `pcm_22050` on the request, then resample in the backend with `numpy` / `scipy.signal.resample_poly` / `librosa.resample` / `audioresample` to 48 kHz before hitting the socket. Do **not** try to set ElevenLabs `output_format=pcm_48000` — that path is encoded-PCM, not raw, and behaves inconsistently across voices.

If the format is wrong the avatar will either play garbled audio (rate mismatch) or produce no lip-sync (NaN trap inside the ONNX log-mel — the silence threshold catches obvious zero frames but not malformed PCM).

---

## 2. TCP framing — non-negotiable

One TCP connection per avatar, port **4500** by default (override with `-AvatarPort=N` on the game command line).

Each frame:

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
| `0` | raw PCM bytes | Audio chunk (must match §1 format). |
| `1` | UTF-8 JSON | Command (emotion / microexpression / config / etc — see [TCP protocol](/avatardirector-docs/protocol/tcp/)). |

A second connection on the same port is rejected — drop and reconnect; do not multiplex.

### 2.1 Recommended audio chunk cadence

- **Chunk size:** 1920–4800 bytes per frame (≈10–25 ms of audio at 48 kHz mono 16-bit). Smaller is fine; the ring buffer (200 ms capacity) absorbs jitter.
- **Send rate:** as fast as the TTS produces. Don't pace artificially — the ring buffer drains at real time and applies its own backpressure.
- **Backpressure signal:** if the audio queue overflows you'll see `[Audio]` warnings on the debug overlay. If you see them sustained, your TTS is producing faster than 48 kHz wall-clock. That's almost always a clock-skew / resample-rate bug on the backend.

> **Debug overlay — off by default.** The overlay is disabled in every build. To see `[Audio]` warnings live, enable it for the session: `-DebugOverlay` on the launch line, or `{"type":"config","key":"debug_overlay","value":1}` over TCP. The same warnings are persisted to the Shipping log if logging is enabled.

### 2.2 What "silence" means to the lip-sync

We treat samples below ~5e-4 absolute (~-66 dBFS) as silence and skip them on the ONNX path (NaN-guard against log-mel underflow). Send real silence (zeros or near-zero noise) freely — the audio still plays, just without spurious mouth motion.

### 2.3 New utterance / sentence boundary

The director auto-detects sentence boundaries using a silence gap. Default: **0.5 s** of no audio (`NewUtteranceGapSeconds`). On gap detection the ONNX session is recycled (fresh hidden state for the next sentence). You don't have to send a `reset` command between utterances unless you want to forcibly cut earlier — the gap detector is the normal mechanism.

If your TTS produces gapless multi-sentence output, the director treats the whole stream as one utterance and only resets when audio actually stops for ≥0.5 s or `SilenceTimeoutSeconds` (2.0 s) elapses, returning the avatar to Idle.

---

## 3. Lip-sync config keys you can stream

Send via type-1 JSON: `{"type":"config","key":"<name>","value":<v>}`. All take effect live unless noted.

### 3.1 Model selection

| Key | Values | When to use |
|---|---|---|
| `lipsync_model_mode` | `"standard"`, `"original"`, `"mood"` | Standard = fastest, default. Original = highest quality, more CPU. Mood = mood-conditioned (see §3.3). |
| `lipsync_optimization` | `"highly_optimized"`, `"semi_optimized"`, `"original"` | Standard mode only. Quality vs CPU trade-off. |

Mode and optimization changes rebuild the ONNX session on the next utterance (~20 ms warm rebuild — invisible end-to-end).

### 3.2 Performance / CPU budget

| Key | Default (cloud) | Plugin default | Notes |
|---|---|---|---|
| `lipsync_chunk_size` | **640** | 160 | Larger = less CPU, marginally less responsive mouth. 640 is tuned for shared-CPU cloud at 30 FPS; drop to 160 on dedicated hardware if you want max responsiveness. Live-writable. |
| `lipsync_intra_threads` | **2** | 0 (auto) | ONNX intra-op pool. Bound at 2 to leave CPU for Pixel Streaming encode. Session-init only — applies on next utterance. |
| `lipsync_inter_threads` | **1** | 0 (auto) | Same reason. Session-init only. |

If you're on dedicated single-tenant hardware, set `lipsync_chunk_size = 160`, `lipsync_intra_threads = 0`, `lipsync_inter_threads = 0` to revert to the plugin's auto-tune defaults.

### 3.3 Mood model only (`lipsync_model_mode = "mood"`)

| Key | Default | Range | Notes |
|---|---|---|---|
| `lipsync_mood` | `"neutral"` | `neutral / happy / sad / disgust / anger / surprise / fear / confident / excited / bored / playful / confused` | The current mood label. |
| `lipsync_mood_intensity` | 1.0 | 0.0 – 1.0 | How strongly the mood biases the mouth/face. 0 = effectively neutral. |
| `lipsync_lookahead_ms` | 80 | 20 – 200 (multiple of 20) | Higher = better sync, more latency. |
| `lipsync_output_type` | `"full_face"` | `"full_face"` or `"mouth_only"` | Mouth-only is cheaper if you don't need brow / eye / cheek output from the lip-sync. |

### 3.4 Curve fine-tuning (live, no rebuild)

These match the official "Fine-Tuning Lip Sync Behavior" recipe but folded into the plugin so you don't need to wire a Modify Curve AnimGraph node yourself.

| Key | Default | Range | What it does |
|---|---|---|---|
| `lipsync_jaw_open_scale` | 1.0 | 0.0 – 2.0 | Multiplies `CTRL_expressions_jawOpen` after the generator writes it. Use < 1 to dampen wide-mouth on loud / excited TTS. |
| `lipsync_tongue_out_scale` | 1.0 | 0.0 – 2.0 | Multiplies `CTRL_expressions_tongueOut`. Use < 1 if tongue protrusion looks exaggerated up close. |

Field-tested ranges:

| Symptom | Try |
|---|---|
| Mood model + loud TTS — jaw too wide on stressed vowels. | `lipsync_jaw_open_scale = 0.85 – 0.95` |
| Pixel Streaming portrait — tongue reads as exaggerated on /th/ /l/ /n/. | `lipsync_tongue_out_scale = 0.7 – 0.85` |

---

## 4. Recommended starting profile for a fresh ElevenLabs integration

Send these once on session start (or set them as defaults on the avatar component in the editor):

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

Then drive `lipsync_mood` from your conversation-state machine (matching the avatar's emotional tone), and only revisit the scales / chunk size if something looks off in production.

---

## 5. Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Audio plays, mouth frozen. | PCM format wrong (rate, channels, bit depth) or first chunks all-zero. | Verify §1 with `ffprobe`. Skip leading silence on the backend. |
| Audio plays, mouth lags by ~1 s, then catches up. | Backend is sending faster than wall-clock — clock skew or wrong resample rate. | Check `[Audio]` warning panel; verify your resampler output rate. |
| Mouth motion fine for first 2-3 sentences, then stalls. | Pre-LS-012 build (generator reuse + ONNX hidden-state corruption). | Update to the LS-012+ avatar build. |
| Mouth too open on every loud syllable. | Default jaw scale = 1.0 + Mood model. | `lipsync_jaw_open_scale = 0.9`. |
| Tongue looks distracting at portrait Pixel Streaming distance. | Default tongue scale = 1.0. | `lipsync_tongue_out_scale = 0.8`. |
| `[LipSync] Generator rebuilt — settings changed` keeps appearing. | You're toggling `lipsync_model_mode` / `lipsync_optimization` / `lipsync_intra_threads` / `lipsync_inter_threads` mid-session. | Set those once on session start; only the live keys (`lipsync_mood*`, `lipsync_chunk_size`, the scale knobs) are meant for runtime tuning. |

---

## 6. Compliance audit log

Every TCP frame your backend sends is run through a compliance audit on the avatar side. Anything that deviates from this document is logged under the dedicated `LogAvatarCompliance` category and shown on the debug overlay's warning panel.

> **Debug overlay — off by default.** The overlay (and its warning panel) is disabled in every build. To see compliance warnings live, enable it for the session: `-DebugOverlay` on the launch line, or `{"type":"config","key":"debug_overlay","value":1}` over TCP. The same warnings are persisted to the log file regardless of overlay state.

Filter your session logs with:

```text
LogAvatarCompliance: Warning
```

The audit is designed to give you a fast feedback loop while integrating. A clean run (correct format, correct keys, correct values) produces zero `[Compliance]` warnings and a periodic summary every 30 seconds:

```text
[Compliance] === SUMMARY (periodic) ===
[Compliance]   Audio (process):   chunks=4218 bytes=10797568 minChunk=1280 maxChunk=4096 avgChunk=2560 oddAlign=0 silent=12 clipped=0
[Compliance]   Audio (session):   chunks=87 samples=222720 peak=0.872 dcAvg=-0.0021 rateInferred=47984Hz vs expected 48000Hz
[Compliance]   Commands:          malformedJson=0 unknownTypes=0 unknownConfigKeys=0 outOfRangeClamps=0
```

A dirty run surfaces the specific deviation, e.g.:

```text
[Compliance] Audio rate looks wrong: inferred 22050 Hz vs expected 48000 Hz (>5% off). Backend is sending wrong sample rate or is clock-skewed.
[Compliance] Unknown config key 'lipsync_chunkSize' (#3 total). Payload: {...}. See lipsync-settings docs for the supported key list.
[Compliance] config 'lipsync_lookahead_ms' value 250.0000 out of documented range — clamped to 200.0000.
[Compliance] TCP: Unknown frame type 2 (length 4096). Protocol defines type 0 (audio PCM) and type 1 (JSON command) only. Payload discarded.
```

Each session-end (silence timeout, sentence-gap recycle, reset) emits a final summary so you can attribute warnings to specific utterances. On shutdown, the process-scope totals are dumped one last time.

If something here is unclear or you'd like additional coverage in the audit, file an issue — that's exactly what it's there for.

---

## 7. Build stamp

These keys and defaults apply to AvatarDirector builds with the LS-013 / LS-014 tags or later. Earlier builds may be missing the curve scale knobs, ship `lipsync_chunk_size = 160` / `lipsync_lookahead_ms = 100`, and lack the `LogAvatarCompliance` audit category entirely. Confirm by checking the build stamp in the debug overlay header row, or send `{"type":"config","key":"lipsync_jaw_open_scale","value":1.0}` and watch the log — pre-LS-013 builds will not log a `config:` line for that key, and pre-LS-014 builds will not log under `LogAvatarCompliance`.
