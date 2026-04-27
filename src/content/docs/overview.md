---
title: Overview
description: AvatarDirector drives a MetaHuman avatar in real time from an external backend, receiving commands and streaming PCM audio over a single TCP socket.
---

AvatarDirector is an Unreal Engine 5.7 plugin. It exposes one TCP socket on port `4500` and accepts:

- **PCM audio** (48 kHz, 16-bit little-endian, mono) — drives lip-sync.
- **JSON commands** — drive emotions, microexpressions, body gestures, gaze, and runtime configuration.

A single backend connection feeds the avatar everything it needs. The plugin marshals every dispatch onto the game thread before touching animation state, so authors can wire it up without thinking about UE threading rules.

## What it handles

- TCP command + audio on port `4500` (configurable via `-AvatarPort=N` on the game command line).
- PCM audio forwarded to on-device ML lip-sync (CPU ONNX, with optional mood model).
- 8 emotions × 22 microexpressions × body-gesture montages, sequenced through a single state machine.
- Autonomous gaze FSM plus look-at targeting for idle and conversational behaviour.
- Optional integration with companion plugins (auto-detected, hidden when absent).

## What it does not handle

- TTS generation — the backend produces PCM and sends it; the avatar plays it.
- Conversation logic — drive the avatar from any controller (Python, Node, an LLM agent, a scripted scene).
- Pixel streaming setup — covered separately in the host project, not in the plugin.

## Where to go next

- **[Prerequisites](/avatardirector-docs/prerequisites/)** — engine version and required plugins.
- **[Installation](/avatardirector-docs/installation/)** — getting the plugin into a project.
- **[TCP protocol](/avatardirector-docs/protocol/tcp/)** — wire format for everything the backend sends.
- **[Lip-sync settings](/avatardirector-docs/protocol/lipsync-settings/)** — required audio format, framing, and tunables for TTS integrators.
- **[Session lifecycle](/avatardirector-docs/protocol/session-lifecycle/)** — when sessions start, end, and what each command does to them.
- **[LS009 release notes](/avatardirector-docs/releases/ls009/)** — most recent customer-facing update.
