---
title: Prerequisites
description: Engine version, required plugins, and optional integrations.
---

## Engine

- **Unreal Engine 5.7** — Launcher build or Source build, both work. The plugin is checked against the Launcher 5.7 reference (`BuildId 47537391`).
- **Windows 64-bit** — the plugin is developed and shipped against Win64 first. Other platforms are not currently supported.

## Required plugins

| Plugin | Why |
|---|---|
| `MetaHuman` | The avatar itself. |
| `RuntimeMetaHumanLipSync` (Georgy Treshchev) | On-device ML lip-sync. The plugin links against it as a hard dependency. |
| `NNE` (built-in) | Neural Network Engine, used for the ONNX lip-sync models. |

## Optional plugins

These are detected at construction. Missing plugins are silently skipped — they are never a build failure.

| Plugin | Effect when present |
|---|---|
| `ZenBlink` | Plug-in eye blink behaviour engages automatically. |
| `ZenDyn` | Plug-in dynamic-pose noise engages automatically. |
| `OVRLipSync` | Opt-in alternate lip-sync model. Off by default; gated by a compile-time switch. |

## Backend side

Anything that can open a TCP socket and send bytes can drive the avatar. There are no Unreal-side dependencies on Python, Node, or any specific runtime — the plugin is transport-agnostic above the socket boundary.
