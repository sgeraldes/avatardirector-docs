---
title: Instalación
description: Cómo meter el plugin AvatarDirector en tu proyecto de Unreal.
---

El plugin vive en `Plugins/AvatarDirector/` dentro de un proyecto de Unreal. Hay tres estrategias de instalación, todas válidas:

## 1. Copia directa

Copia la carpeta `Plugins/AvatarDirector/` al directorio `Plugins/` de tu proyecto. Simple, autocontenido, fácil de auditar. Lo mejor cuando entregas un snapshot fijo.

## 2. Submódulo de git

Si mantienes el plugin en su propio repo, agrégalo como submódulo apuntando a `Plugins/AvatarDirector/`. Lo mejor cuando varios proyectos consumen actualizaciones del mismo upstream.

## 3. Junction / symlink

Para desarrollo activo entre dos proyectos (por ejemplo, un repo source-of-truth interno y un proyecto demo), un junction de directorio propaga los cambios en vivo. Lo mejor para flujos en una sola máquina.

## Después de instalar

1. Añade `AvatarDirector` al array `Plugins` de tu `.uproject`, o actívalo desde el panel Plugins del editor.
2. Verifica que los [plugins requeridos](./prerequisites#plugins-requeridos) también estén activados.
3. Regenera los archivos de proyecto de Visual Studio.
4. Compila el target Editor.
5. Abre el proyecto, coloca un `AAvatarDirectorActor` en tu nivel (Patrón A), o haz que un GameMode lo spawee en runtime (Patrón B).

## Verificar la instalación

El plugin está bien cableado si:

- `AvatarDirector.dll` (Editor) y/o `AvatarDirector.so/dylib/dll` (Runtime) aparecen en `Plugins/AvatarDirector/Binaries/`.
- El listener TCP loguea `Listening on port 4500` al cargar el nivel.
- Un backend que se conecta puede enviar un frame de audio y la boca del avatar se mueve.

Para un sanity check end-to-end hay un smoke test stdlib-only en `Tools/smoke_test.py` dentro del árbol del plugin — córrelo contra una sesión PIE.
