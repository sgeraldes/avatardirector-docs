---
title: Requisitos
description: Versión del motor, plugins requeridos e integraciones opcionales.
---

## Motor

- **Unreal Engine 5.7** — sirve tanto la build del Launcher como una build desde Source. El plugin se valida contra Launcher 5.7 (`BuildId 47537391`).
- **Windows 64-bit** — el plugin se desarrolla y entrega contra Win64 primero. Otras plataformas hoy no están soportadas.

## Plugins requeridos

| Plugin | Por qué |
|---|---|
| `MetaHuman` | El avatar en sí. |
| `NNE` (incluido en UE) | Neural Network Engine. Lo usan los modelos ONNX de lip-sync. |

El runtime de lip-sync ML on-device viene **dentro de este plugin** — no requiere ningún plugin de lip-sync de terceros.

## Plugins opcionales

Se detectan al construir el actor. Si no están, simplemente se omiten — nunca rompen la build.

| Plugin | Efecto cuando está presente |
|---|---|
| `ZenBlink` | Activa parpadeo basado en el plugin automáticamente. |
| `ZenDyn` | Activa ruido dinámico de pose automáticamente. |
| `OVRLipSync` | Modelo alternativo de lip-sync opt-in. Apagado por defecto; controlado por un switch en tiempo de compilación. |

## Del lado del backend

Cualquier cosa que pueda abrir un socket TCP y enviar bytes puede controlar al avatar. No hay dependencias de Unreal hacia Python, Node ni ningún runtime concreto — el plugin es agnóstico al transporte por encima del socket.
