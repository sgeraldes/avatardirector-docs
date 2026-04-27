---
title: Support
description: How to file bug reports, request features, ask for help, and submit logs.
---

**Audience:** anyone integrating against the AvatarDirector plugin or running it in production who needs to report a bug, request a feature, ask for help, or hand off diagnostic data.

If you're an end-user customer, the contact channel your team agreed to in the integration kickoff takes priority over anything below.

---

## 1. Before opening anything — quick triage

Two minutes of triage saves hours of round-trips. In order:

1. **Does the smoke test still pass?** Run the stdlib-only `smoke_test.py` shipped with the plugin against a PIE or packaged session. It exercises every command type and streams a 1.5 s 440 Hz sine wave so the mouth flaps at the tone. If the smoke test fails, it prints exactly which step broke — that's already 80% of a useful bug report.
2. **Stale Editor DLL?** About a third of "weird editor behavior" reports trace to a cached DLL after a property change. Close the editor, rebuild the Editor target, reopen, retry. If the symptom is gone, you're done.
3. **Compliance log clean?** Filter your Shipping log for `LogAvatarCompliance: Warning`. If the audit reports a deviation (wrong sample rate, malformed JSON, unknown config key, out-of-range value), the issue is on the backend side and the log line tells you exactly what's wrong. See [Lip-sync settings § Compliance audit log](/avatardirector-docs/protocol/lipsync-settings/#6-compliance-audit-log).
4. **Build stamp current?** The debug overlay header row shows the build stamp (e.g. `Apr 22 2026 01:13`). If you're on an old build, the bug may already be fixed — check the [release notes](/avatardirector-docs/releases/ls009/).

If after those four checks the issue is still real, file a report.

---

## 2. Bug reports

A good bug report has three things: what you saw, what you expected, and the artifacts to verify both. Use this template:

```text
### Summary
One sentence. What broke.

### Build stamp
From the debug overlay header row, or from the Shipping log header.
Example: Apr 22 2026 01:13

### Environment
- Platform: Windows / EC2 g4dn.xlarge / etc.
- Engine: UE 5.7 source / launcher
- Plugin version / commit SHA: (from your integration kit)
- Backend / TTS: ElevenLabs realtime, custom, etc.

### Steps to reproduce
1. ...
2. ...
3. ...

### Expected behavior
What should have happened.

### Actual behavior
What happened instead. Include screenshots / video if visual.

### Logs
Attach the log file from the affected session (see §5 below for location and packaging).

### Severity
- Critical: avatar unusable, no workaround
- High: feature broken, workaround exists
- Medium: cosmetic / edge case
- Low: nice-to-have polish
```

**File at:** the channel agreed in your integration contract, or — for documentation issues — at the [docs repo issue tracker](https://github.com/sgeraldes/avatardirector-docs/issues/new).

**What makes a bug report fast to triage:**

- A reproduction recipe that doesn't depend on production state. "Works in `smoke_test.py` with these flags" is much faster than "happens sometimes after a long session."
- Logs from a session that includes the failure, not from a healthy run with the failure described from memory. The compliance audit often pinpoints the exact frame that triggered the issue.
- Build stamp. Without it we can't tell if it's already fixed.
- One issue per report. "Lip-sync stutters AND emotion looks wrong AND TCP keeps disconnecting" is three reports.

**What slows triage down:**

- Screenshots of the avatar without logs. We can see the symptom but can't see why.
- "It's broken" with no repro. We can't fix what we can't reproduce.
- Reports that mix multiple unrelated issues.
- Edited / redacted logs that remove the timestamps or build-stamp header. Redact PII from message payloads if needed, but leave the framing intact.

---

## 3. Feature requests

A good feature request explains the problem you're trying to solve, not the implementation you want. We'll often have ideas about better ways to solve it that aren't visible from the integrator side.

```text
### Problem
What is the user-facing problem? Why does the current behavior not solve it?
(e.g. "Backend wants the avatar to project specific attention modes during multi-party
conversations — current `listen` is binary, but we have at least three distinct postures
to express: actively-listening, half-attentive, and waiting-to-respond.")

### Proposed solution (optional)
Sketch of what you'd like. We'll use this as input, not as spec.

### Workarounds you tried
What you currently do to work around the gap. Helps us judge urgency.

### Use case scope
- Just our deployment, or industry-general?
- How often does the gap bite you? Daily, weekly, occasionally?
- Is this a launch blocker, or a backlog wishlist item?
```

**Things that make a feature request more likely to land soon:**

- Concrete user-facing problem, not "wouldn't it be cool if."
- A workaround you're currently using — proves the gap is real and quantifies the cost.
- Generality across multiple use cases.
- Willingness to test a draft implementation before we ship it broadly.

**Things that don't help:**

- Asking for changes that contradict design constraints (one TCP client at a time, ONNX-driven mouth, RigLogic-driven face) — those are foundations, not bugs.
- Vague "make it better" requests without a target outcome.

---

## 4. Asking for help

If you're not sure whether something is a bug, a feature gap, or a misuse, just ask. Easier to clear up in 5 minutes of back-and-forth than to round-trip through the bug-report process.

```text
### What I'm trying to do
The end goal. Not "send a config command" — "have the avatar look attentive while
the user talks for up to 30 seconds."

### What I tried
The actual commands / config you sent, or the code path you took.

### What I see
What the avatar actually does. Logs / video / screenshots.

### What I expected
Your mental model of what should happen. If your mental model differs from the docs,
we'd like to know — that's a docs bug worth fixing.

### Doc links you already read
So we don't point you back at pages you already checked.
```

For something time-sensitive (production down): use the priority escalation channel agreed in the support contract, not the bug tracker.

---

## 5. Submitting logs

Without logs, post-mortem support is essentially guesswork.

### 5.1 Where the logs live

| Build | Log path |
|---|---|
| Shipping (cloud / Pixel Streaming) | `%LOCALAPPDATA%\<ProjectName>\Saved\Logs\<ProjectName>.log` |
| Development / Editor | `<Project>\Saved\Logs\<ProjectName>.log` |
| Rotated backups | `<ProjectName>-backup-YYYY.MM.DD-HH.MM.SS.log` (same directory as the active log) |

A long session may rotate the log mid-incident. Always include the active log AND any backup files written during the affected window — Unreal rotates on each launch and at certain size thresholds.

### 5.2 What's in a useful log capture

The log includes:

- Build stamp at the header (which version was running)
- TCP socket lifecycle (`AvatarNetworkManager: Listening on port 4500`, client connect / disconnect)
- Every command received (under the standard log category, plus `LogAvatarCompliance` for protocol violations)
- State machine transitions (`Idle` / `Speaking` / `Emoting` / `Transitioning`)
- Lip-sync session lifecycle (session start, generator rebuilds, ONNX model load)
- Audio queue depth warnings (`[Audio]` category)
- The `[Emotion]` / `[LipSync]` / `[Audio]` ring-buffer warnings even when the debug overlay is off

### 5.3 Packaging tips

- **Compress.** Logs can grow into multi-MB territory on long sessions. Zip before sending; we'll unzip.
- **Include the timestamp window.** Note approximately when the issue happened. Easier than scanning thousands of lines.
- **Don't truncate.** Full logs are more useful than excerpts. If the full log is too large to send in one piece, send the rotated backup that covers the incident window plus the next file.
- **Don't redact framing.** If you must redact PII from JSON payloads, replace string contents with `"<redacted>"` but leave the field structure intact — the bug may be in the framing, and redacting whole lines hides that.
- **Include the smoke-test output too** if the issue is reproducible there.

### 5.4 Privacy / redaction

The plugin does not log raw PCM audio. It does log:

- Command JSON payloads (which may contain user-facing message text if your backend embeds it)
- Lip-sync mood values, emotion names, microexpression names
- File paths on the host machine
- Network endpoints (the PixelStreaming signaling URL is logged at startup)

If your deployment handles PII (medical, financial, etc.) and command payloads include sensitive text, redact those payloads before sharing. Replace the `value` / `text` field contents with `<redacted-len-N>` so the framing stays intact while the content is removed. Don't strip whole log lines — that masks the surrounding context we need to diagnose.

---

## 6. The compliance audit (read this if you're a backend integrator)

Every TCP frame your backend sends is run through a compliance audit. Anything that deviates from the documented protocol is logged under `LogAvatarCompliance` and surfaced in the debug overlay's warning panel.

Filter your session log with `LogAvatarCompliance: Warning` — if the result is empty, your backend is wire-compliant. If it has entries, those are pre-classified bug reports against your backend, ready-formatted with the specific deviation and remediation. Send those before opening a bug against the avatar; they're often the answer.

Full audit catalogue: [Lip-sync settings § Compliance audit log](/avatardirector-docs/protocol/lipsync-settings/#6-compliance-audit-log).

---

## 7. Severity guidance

When triaging, we use roughly this scale. Your customer support contract may override these.

| Severity | Examples | Response |
|---|---|---|
| **P0 — Production down** | Avatar crashes on every utterance; TCP listener won't bind; Shipping build won't start. | Same-day mitigation; root-cause within 48 h. Reach the priority channel agreed in the support contract, not the bug tracker. |
| **P1 — Critical feature broken** | Lip-sync stuck open; emotions not applying; specific config keys ignored. | Days, not weeks. Bug tracker with `critical` label. |
| **P2 — Feature impaired** | Cosmetic drift, edge-case races, intermittent visual artifacts. | Next planned release. Standard bug tracker. |
| **P3 — Polish / nice-to-have** | Wording in a log, marginal animation tweaks. | Backlog. Bug tracker, no urgency label. |
| **F — Feature request** | New capability, new config key, new command type. | Sprint planning. `enhancement` label. |
