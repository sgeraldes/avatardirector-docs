---
title: Installation
description: Getting the AvatarDirector plugin into your Unreal project.
---

The plugin lives at `Plugins/AvatarDirector/` inside an Unreal project. There are three install strategies, all valid:

## 1. Direct copy

Copy the `Plugins/AvatarDirector/` folder into your project's `Plugins/` directory. Simple, self-contained, easy to audit. Best for shipping a fixed snapshot.

## 2. Git submodule

If you keep the plugin in its own repository, add it as a git submodule pointing at `Plugins/AvatarDirector/`. Best when you want to track upstream updates from multiple consuming projects.

## 3. Junction / symlink

For active development across two projects (e.g. an internal source-of-truth repo and a demo project), a directory junction lets edits propagate live. Best for one-machine workflows.

## After install

1. Add `AvatarDirector` to the `Plugins` array of your `.uproject`, or enable it from the editor's Plugins panel.
2. Make sure the [required plugins](/avatardirector-docs/prerequisites/#required-plugins) are also enabled.
3. Regenerate Visual Studio project files.
4. Build the editor target.
5. Open the project, place an `AAvatarDirectorActor` in your level (Pattern A), or have a GameMode spawn one at runtime (Pattern B).

## Verifying the install

The plugin is correctly wired up if:

- `AvatarDirector.dll` (Editor) and/or `AvatarDirector.so/dylib/dll` (Runtime) appear in `Plugins/AvatarDirector/Binaries/`.
- The TCP listener logs `Listening on port 4500` at level start.
- A connecting backend can send a single audio frame and observe the mouth flapping.

For an end-to-end sanity check there's a stdlib-only smoke test in `Tools/smoke_test.py` inside the plugin tree — run it against a PIE session.
