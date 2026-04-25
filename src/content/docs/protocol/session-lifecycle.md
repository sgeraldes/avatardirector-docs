---
title: Session lifecycle
description: How `reset`, `listen`, `stop`, and the lip-sync ONNX session interact, and how to choose the right command for the job.
---

**Audience:** backend engineers integrating with the AvatarDirector TCP protocol on port 4500.

This document explains what each of `reset`, `listen`, `stop` actually does at the avatar engine level, how the lip-sync ONNX session lifecycle interacts with all of them, and how to choose the right command for the job.

---

## TL;DR

- `reset` is the only command that **destroys the ONNX lip-sync generator**. It also flushes the audio queue and zeroes engine state. Use it when you need a hard reinitialization.
- `listen` is a **gaze and attention** command. It does not touch the audio queue, the lip-sync session, or the ONNX. It tells the avatar "the user is talking now, look engaged."
- `stop` is a **pause** — audio is frozen mid-stream, the ONNX session stays alive, no state is cleared. The follow-up to `stop` is either `reset` (drop everything) or another audio chunk (resume).
- The ONNX is **also destroyed automatically** on natural silence-timeout (default 2 s of no audio in `Speaking`). So in steady-state operation you do not need to send `reset` between every utterance — the engine does it for you.
- `reset` and `listen` are **orthogonal**. Sending one does not imply the other. The common between-turn pattern of `reset` then `listen` is two distinct decisions (clean state, then signal attention) that happen to be sent together.

---

## The lip-sync session lifecycle

Every utterance is bracketed by a "lip-sync session" — the lifetime during which the ONNX hidden state is meaningful.

**Open:** the first audio chunk after `Idle` opens a session. The internal generator constructs an ONNX runtime instance, loads the model (the standard or Mood variant), and begins running inference on the streamed PCM.

**Close:** the session ends — and the ONNX session is freed — in five places:

1. Editor / level transition shutdown.
2. Mid-session corruption guard inside the audio handler (defence against malformed PCM).
3. Direct landing in `Idle` while a session was active.
4. `Transitioning → Idle` complete.
5. Explicit backend `reset` (or `reset` with `target:"speaking"`).

Cases 3 and 4 are the natural-end paths: while in `Speaking`, the engine measures `TimeSinceLastAudio`, and once it passes `SilenceTimeoutSeconds` (default 2.0 s), the state machine drops to `Idle` and the session closes. Case 5 is the only backend-driven teardown.

**Why destroy the ONNX between utterances at all?** Hidden state from utterance N can leak phoneme bias into the first ~100 ms of utterance N+1. The generator is cheap to rebuild (one model load, sub-100 ms warmup) and the freshness is worth the cost. Long-lived sessions also drift in observable ways under specific edge cases — the LS-009 stutter incident in field reports was traceable to stale ONNX state interacting with rapid emotion commands, and the fix was to make sure the destroy paths actually fire.

So in practice: every utterance gets its own ONNX session, the session is closed deterministically, and the next utterance starts clean. The backend rarely needs to manage this — only when overriding the natural lifecycle.

---

## The four backend intents — long form

What follows is one section per common "I want to..." backend intent, with the right command, the wire format, what actually happens, what happens to the ONNX, and an example.

### 1. Tear down ONNX, flush audio, be ready for the next utterance

**Command:** `reset` (full, no target).

```python
sock.send(make_packet(1, json.dumps({"type": "reset"}).encode("utf-8")))
```

This is the heaviest backend command in the protocol. The full reset executes every reset block in sequence:

- **Speaking block:** clears the paused-speaking flag, resumes audio if it was frozen by a prior `stop`, drains any queued PCM samples, and — if a session was active — closes it and **destroys the lip-sync generator**. It also broadcasts a session-ended event so any externally-bound generator tears down. This is the ONNX kill.
- **Emotion block:** drops the current emotion to Neutral, clears all emotion target curves, applies Neutral via ZenDyn if enabled.
- **Expression block:** clears the microexpression engine's active set.
- **Gesture block:** stops any active anim-gesture montage with the configured blend-out time.
- **Gaze block:** centers the look-at target, zeroes the head offset and eye aim, snaps the autonomous-gaze FSM to Engaged, drops listening mode, clears the disengagement counter, and clears the off-camera Drifting cache so the FSM can't snap to a stale target on the next tick.
- **Head block:** zeroes head rotation and the four head layer rotators (gesture, idle, drift, look-at).
- **Full-reset finalization:** zeroes every face curve, clears every pause flag (so the avatar is fully responsive again, not stuck in a frozen state), and drives the state machine to `Idle`.

After all that, the next inbound audio chunk will (a) open a new session, (b) construct a new generator with fresh ONNX hidden state, (c) begin streaming visemes. Latency from the first sample to the first viseme is the model warmup time — typically under 100 ms with the default `Standard / SemiOptimized` configuration.

**When to use this:** between conversational turns when you want a known-clean starting state, or after a long pause where you suspect the autonomous gaze FSM has drifted somewhere unflattering, or as a recovery action for a stuck animation. **What it costs:** the ONNX warmup latency for the next utterance, the visual snap-to-center of head and eyes, and a state-machine round-trip through Idle.

If you only need the lip-sync teardown and want to leave gaze, emotion, and head state untouched, send the targeted form:

```python
sock.send(make_packet(1, json.dumps(
    {"type": "reset", "target": "speaking"}
).encode("utf-8")))
```

The "speaking" target hits only the speaking block above — audio flush, session end, ONNX destroy, state to Idle — and leaves everything else in place. This is the right call when you want to interrupt the current utterance without disturbing the avatar's emotional or postural readout.

---

### 2. Signal "user stopped talking, I'm listening attentively"

**Command:** `listen` (or equivalently the `listening_mode` config key).

```python
sock.send(make_packet(1, json.dumps({"type": "listen"}).encode("utf-8")))
```

Listening mode sets the listening flag, resets the disengagement counter (so the autonomous gaze won't drift away from the camera while the user is talking), cancels any in-progress re-engagement step, and runs a re-engage variant — picking one of 12 weighted choreographies (subtle head tilt, brow raise, eye micro-saccade) tuned for "I'm paying attention." It then locks the autonomous gaze FSM into Engaged for ~3.5 s so it cannot drift away during the variant playback.

That is the entire scope. The lip-sync session is not touched. The audio queue is not flushed. The lip-sync generator is not destroyed. If the avatar happened to be mid-Speaking when you sent `listen`, the speaking continues — `listen` does not interrupt it. The 12 variants only run on the gaze/face channel; they do not stack onto mouth articulation.

The functionally-equivalent config form is:

```python
sock.send(make_packet(1, json.dumps(
    {"type": "config", "key": "listening_mode", "value": 1}
).encode("utf-8")))
```

Use whichever form is more convenient in your backend dispatch table — they are identical at the engine level.

**When to use this:** at the start of a user turn (microphone opens / VAD detects voice / push-to-talk pressed). The avatar will visibly project attention. If audio from the avatar's own response is still tail-playing when the user starts talking, you may want to send `reset` (target `speaking`) before `listen` to cut the avatar off cleanly — see the "wipe and listen" pattern below.

**One subtle interaction:** listening mode is automatically cleared the moment new audio arrives (when `bAutoExitListeningOnSpeech` is true, the default). So you usually do not need to explicitly cancel `listen` — sending the avatar's response audio cancels it as a side effect. Explicit cancellation is only needed if you want to leave listening mode without sending audio (e.g. the user-turn timed out and you're going to remain silent).

---

### 3. Cancel listen mode without any teardown

**Command:** the `listening_mode` config key with value `0`.

```python
sock.send(make_packet(1, json.dumps(
    {"type": "config", "key": "listening_mode", "value": 0}
).encode("utf-8")))
```

This clears the listening flag and resets the disengagement state. That is all. The autonomous gaze FSM resumes its normal Engaged → Drifting → Introspective → ReEngaging cycle. No teardown of any kind happens.

There is intentionally no `{"type": "listen", "value": 0}` form — `listen` is fire-and-forget (it picks a variant and runs it). The exit path is the config key.

**When to use this:** the user-turn ended without speech (timeout, push-to-talk released without audio), and you want the avatar to stop projecting "I'm listening" attention before the next event. In most conversational backends you will not need this — the auto-exit on speech (§2) covers the common case.

**What this is NOT:** this is not a way to end the avatar's speech. The avatar's own audio playback is untouched. If you want to end speech, see §6 below.

---

### 4. Pause speech without dropping the session

**Command:** `stop` with target `speaking`.

```python
sock.send(make_packet(1, json.dumps(
    {"type": "stop", "target": "speaking"}
).encode("utf-8")))
```

This sets a paused-speaking flag and freezes audio mid-stream — the last sample played is held — and no further samples are pulled from the queue. The lip-sync session does **not** end. The session flag stays true. The ONNX generator stays alive in memory with its hidden state intact.

This is significant because the silence-timeout watchdog only counts `TimeSinceLastAudio`. While paused, no audio is being received, so `TimeSinceLastAudio` keeps climbing. After 2 seconds (default `SilenceTimeoutSeconds`), the watchdog will tear down the session anyway, exactly as it would for natural silence. So `stop` is a short-window pause — useful for "wait, the user interrupted" type patterns where you may resume within a second or two — but not a long-term hold.

**Resuming from `stop`:** the next inbound audio chunk does not automatically unpause. Either send `reset target:"speaking"` (clears the pause flag, flushes the queue, ends the session — the next audio starts a brand-new utterance), or send a follow-up command that explicitly resumes. In practice the cleanest backend pattern is "if you want to resume, you actually want a fresh utterance" — so the resume path is `reset target:"speaking"` followed by the new audio stream.

**Other `stop` targets** (`emotion`, `expression`, `gesture`, `gaze`, `head`, and the multi-system `moving`) all share the same semantic: pause that subsystem's writer at its current value. None of them touch the lip-sync session. The targeted variants are useful for staging interactive scenes ("freeze the body gesture but keep the face expressive") but rarely needed in a chat backend.

---

### 5. Interrupt a long utterance immediately

**Command:** `reset` with target `speaking`.

```python
sock.send(make_packet(1, json.dumps(
    {"type": "reset", "target": "speaking"}
).encode("utf-8")))
```

This is the textbook "barge-in" handler. The avatar is mid-utterance, the user starts talking, your VAD/turn-detector decides to cut the avatar off. The targeted `reset speaking` (a) immediately flushes the audio queue (current sample plays out the buffer, but nothing further is pulled), (b) closes the lip-sync session, (c) destroys the ONNX generator, (d) drops the state machine to Idle. The mouth closes within a frame or two. The avatar's body, gaze, and emotion are not disturbed.

If you also want to signal the user-turn attention, follow it with `listen`:

```python
sock.send(make_packet(1, json.dumps(
    {"type": "reset", "target": "speaking"}
).encode("utf-8")))
sock.send(make_packet(1, json.dumps({"type": "listen"}).encode("utf-8")))
```

The two are independent — there is no single "barge-in" command in the protocol because the gaze decision and the audio decision are separately useful.

**Why not just send a full `reset`?** The full reset zeroes head and gaze state too, which produces a visible snap-to-center of the head and eyes. For a conversational interrupt, that snap is jarring — the avatar should look like it stopped talking because the user spoke, not like it was teleported. Using the targeted form keeps the postural state intact.

---

### 6. Recover from a known bad state mid-session

**Command:** full `reset`.

```python
sock.send(make_packet(1, json.dumps({"type": "reset"}).encode("utf-8")))
```

This is the recovery hatch. If something goes wrong during a long-running session — visible mouth lag, stuck emotion, wrong gaze, frozen gesture — full `reset` is the deterministic way to get back to a known-good state. It zeroes every channel and drives to Idle. The next command starts from a clean slate.

The LS-009 incident is the canonical case study. Field reports described the avatar's mouth becoming sluggish during long Shipping sessions with rapid emotion traffic. The user-side mitigation was a manual `stop → reset → emotion:neutral` triplet, which immediately restored normal behavior. The engine fix (LS-009 series) eliminated the underlying cause, but the recovery hatch remains valid for any future class of issues.

**You should not need this often.** If your backend is sending `reset` more than once per minute under normal load, something is wrong upstream — investigate before adding the workaround. The healthy steady-state is: silence-timeout closes sessions automatically, your backend rarely sends `reset` at all.

---

### 7. The "wipe and listen" combo — between conversational turns

**Pattern:** send `reset` immediately followed by `listen`.

```python
sock.send(make_packet(1, json.dumps({"type": "reset"}).encode("utf-8")))
sock.send(make_packet(1, json.dumps({"type": "listen"}).encode("utf-8")))
```

This is the most common between-turn dispatch in a typical chat backend: "the user is about to talk, drop everything from the last avatar utterance, then signal attention." The two commands are orthogonal but commonly co-occur, which is what motivated this doc.

**Order matters slightly.** Sending `listen` before `reset` means the reset will clear the listening flag (the gaze block sets it to false), undoing the listen — you'd have to send `listen` again. Sending `reset` first, then `listen`, leaves the avatar in `Idle` with listening mode true, which is the correct state for "ready and attentive."

**A lighter alternative:** if the previous utterance has already ended naturally (silence-timeout closed the session, the avatar is in Idle, the ONNX is already destroyed), the `reset` adds nothing and you can skip it:

```python
sock.send(make_packet(1, json.dumps({"type": "listen"}).encode("utf-8")))
```

In practice it's safer to always send `reset` first (idempotent — no harm done if there's nothing to reset) than to track state on the backend side. The cost is negligible.

---

## Anti-patterns

A short list of things that look like they should work but don't, or that work but cost you something.

**Sending `reset` after every utterance "just to be safe."** Unnecessary. The silence timeout handles the destroy automatically. Adding `reset` on top forces an immediate state-machine round-trip and a visible snap to default head/gaze if you used the full form. Use targeted `reset speaking` if you genuinely need to interrupt; otherwise let the engine close the session.

**Using `stop` as a long-term pause.** `stop` only freezes audio; it does not freeze the silence-timeout watchdog. After 2 seconds of being stopped, the session ends naturally. If you want a long-term hold on the avatar, you need a different model — there is no "indefinite pause" command in the protocol because the avatar is designed for conversational latency, not playback control.

**Sending `listen` to end the avatar's speech.** `listen` is gaze and attention only. The avatar's own speech audio continues to play out. To end speech use `reset speaking` (clean) or `stop speaking` (frozen, expires after silence timeout).

**Sending `listening_mode:0` to interrupt the avatar's speech.** Same problem as above — `listening_mode:0` only clears the listening flag and resets the disengagement counter. It does nothing to audio, lip-sync, or the ONNX. Use `reset speaking`.

**Treating `reset` and `listen` as a single concept.** They are independent. A user-turn boundary is a backend decision composed of two separate avatar-side decisions: (1) what to do with the previous avatar state, (2) what posture to project for the new turn. Most backends want `reset` + `listen`, but the protocol exposes them separately because some backends want only one (e.g. a TTS-driven test harness that never enters listening mode).
