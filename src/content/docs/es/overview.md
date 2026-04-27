---
title: Visión general
description: AvatarDirector controla un avatar MetaHuman en tiempo real desde un backend externo, recibiendo comandos y transmitiendo audio PCM por un único socket TCP.
---

AvatarDirector es un plugin de Unreal Engine 5.7. Expone un único socket TCP en el puerto `4500` y acepta:

- **Audio PCM** (48 kHz, 16-bit little-endian, mono) — controla el lip-sync.
- **Comandos JSON** — controlan emociones, microexpresiones, gestos corporales, mirada y configuración en runtime.

Una sola conexión de backend alimenta al avatar con todo lo que necesita. El plugin lleva cada despacho al game thread antes de tocar el estado de animación, así no hace falta pelearse con las reglas de threading de UE.

## Qué cubre

- Comandos y audio TCP en el puerto `4500` (configurable con `-AvatarPort=N` en la línea de comandos del juego).
- Audio PCM enviado al lip-sync ML on-device (ONNX en CPU, con modelo mood opcional).
- 8 emociones × 22 microexpresiones × montages de gestos corporales, secuenciados por una sola máquina de estados.
- FSM de mirada autónoma más look-at explícito para comportamiento idle y conversacional.
- Integración opcional con plugins compañeros (detectada automáticamente, oculta cuando no están).

## Qué NO cubre

- Generación TTS — el backend produce PCM y lo envía; el avatar lo reproduce.
- Lógica de conversación — el avatar se controla desde cualquier orquestador (Python, Node, un agente LLM, una escena scripteada).
- Setup de pixel streaming — eso vive en el proyecto host, no en el plugin.

## Siguientes pasos

- **[Requisitos](/avatardirector-docs/es/prerequisites/)** — versión del motor y plugins requeridos.
- **[Instalación](/avatardirector-docs/es/installation/)** — cómo meter el plugin en un proyecto.
- **[Protocolo TCP](/avatardirector-docs/es/protocol/tcp/)** — formato de cable para todo lo que envía el backend.
- **[Ajustes de lip-sync](/avatardirector-docs/es/protocol/lipsync-settings/)** — formato de audio obligatorio, framing y tunables para integradores TTS.
- **[Ciclo de vida de la sesión](/avatardirector-docs/es/protocol/session-lifecycle/)** — cuándo empieza y termina una sesión, y qué le hace cada comando.
- **[Notas de versión LS009](/avatardirector-docs/es/releases/ls009/)** — última actualización para clientes.
