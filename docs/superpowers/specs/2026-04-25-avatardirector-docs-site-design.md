# AvatarDirector docs site — design

**Date:** 2026-04-25
**Repo:** `github.com/sgeraldes/avatardirector-docs` (public)
**Local path:** `H:\avatardirector-docs`
**Status:** Approved (sections 1-3 explicit, sections 4-5 by go-ahead)

## 1. Purpose

Public documentation and marketing site for the AvatarDirector Unreal Engine plugin. Audience: TTS/backend integrators (notably Mindlabs LATAM) and prospective users. The plugin source itself stays private in `BasicPX`; this site is hand-authored content only.

## 2. Topology

- **Repo visibility:** public (GitHub Pages free tier).
- **Identity:** `sgeraldes` (personal). Verified via `gh auth status` before any push.
- **Hosting:** GitHub Pages, built and deployed by GitHub Actions on every push to `main`. No `gh-pages` branch — Pages is configured "build from Actions".
- **URL v1:** `https://sgeraldes.github.io/avatardirector-docs/` (Astro `base: '/avatardirector-docs/'`).
- **Custom domain:** deferred. When ready, add CNAME, drop `base`.
- **No coupling** to `RMHLipSyncDemo` or `BasicPX`. This repo evolves independently.

## 3. Stack

- **Astro 6** + **Starlight 0.38** for docs shell (sidebar nav, search via Pagefind, language toggle).
- **Tailwind v4** (via `@tailwindcss/vite`) for the custom landing page and component styles.
- **Inter** (variable, self-hosted via `@fontsource-variable/inter`) for UI/body. **JetBrains Mono** for code (Starlight default).
- **Lucide** icons.
- Static output, deployed as a flat artifact.

## 4. URL structure & i18n

```
/                           → EN landing
/es/                        → ES landing
/en/docs/<slug>             → EN docs
/es/docs/<slug>             → ES docs (mirrored slugs)
```

- EN is the default locale, exposed at root.
- Starlight's built-in language toggle swaps mirrored pages.
- Missing translations show a "Translation pending" banner with a link to the EN equivalent — never a 404.
- Both locales share identical sidebar group structure.

## 5. Sidebar groups (both locales)

1. Getting started — Overview, Prerequisites, Installation, Enable plugin
2. Integration patterns — Pattern A (placed), Pattern B (spawned), Explicit bind
3. TCP protocol & backend — TCP_Protocol, Backend_API_Reference, Backend_LipSync_Settings, Backend_Session_Lifecycle
4. Lip-sync — Primary_Lip_Sync, Audio_Streaming, Audio_Freeze, Silence_Detection, Lip_Sync_Calibrator, Calibrator_Widget
5. Expression system — Emotions, Microexpressions, State_Machine, Listening_Mode, Pause_Resume
6. Body & gaze — Body_Gestures, Body_Idle (+Setup), Head_Gestures, Look_At_Target, Gaze_Modes, Autonomous_Gaze, Organic_Drift
7. Idle behaviors — Idle_Behaviors, Idle_Blink, Idle_Head_Sway, ZenBlink, ZenDyn
8. Face setup — Face_Chain_Setup, Head_PostProcess_Setup, Legacy_Component_Path
9. Runtime & debugging — Runtime_Config, Console_Vars, Debug_Overlay, Command_Monitor, Troubleshooting
10. Reference — API_Reference, Build, Support
11. Release notes — Mindlabs_Backend_Update_LS009, future updates

**Excluded from v1:** `Plugins/AvatarDirector/Docs/specs/00-09` (internal engineering specs).

## 6. Content sanitization rules

Migration scrubs every page of source-internal references:

- Strip `.cpp` / `.h` filenames and any path containing `Source/`.
- Strip line numbers (`Foo.cpp:1234`).
- Strip internal helper class/function names not part of the public API.

What stays: Blueprint nodes, Blueprint-callable methods, public component/actor names, `UPROPERTY` keys, configuration keys, TCP protocol, console variables.

CI grep gate fails the build if `\.cpp` or `\.h\b` or `Source/` appears in any markdown under `src/content/docs/`.

## 7. Translation pipeline

- Source of truth: EN markdown.
- ES translations created by LLM during migration. Voice: LATAM Spanish, engineer-to-engineer, direct, no passive-voice padding (per the customer-doc voice rule).
- ES pages live at `src/content/docs/es/<slug>.md` with the same slug as EN.
- Future content additions: write EN first, run a translation pass, commit both before merging.

## 8. Design system tokens

```
--ad-violet:    #6C5CFF
--ad-cyan:      #00D1FF
--ad-mint:      #7AE582
--ad-amber:     #FFC857
--ad-coral:     #FF6B6B
--ad-fog:       #A1A6B2
--ad-ink:       #1A1F2B
--ad-void:      #0F1219

--ad-grad-primary:     linear-gradient(135deg, #6C5CFF 0%, #00D1FF 100%)
--ad-grad-cyan-mint:   linear-gradient(135deg, #00D1FF 0%, #7AE582 100%)
--ad-grad-amber-coral: linear-gradient(135deg, #FFC857 0%, #FF6B6B 100%)
```

Dark theme only in v1. Buttons: primary (gradient fill), secondary (ink fill, fog border), ghost (no fill, fog border on hover). Status pills: connected (mint), processing (cyan, pulse), warning (amber), error (coral).

## 9. Landing page composition (mirrors mockup)

Custom Astro page at `/`:
- Hero: AD logomark + wordmark, tagline, four feature bullets, UE 5.7 compatible badge, avatar PNG with audio-wave overlay, Live Input panel (PCM stream + State machine mini-graph).
- "How it works" rail: external backend → TCP socket → AvatarDirector plugin → MetaHuman avatar.
- Expression system row: 8 emotion chips, 22 microexpression dots.
- Body gestures row: 5 gesture silhouettes.
- Design system strip: color palette, typography sample, iconography, UI components.
- CTA: "Read the docs" → `/en/docs/`, "View on GitHub" → repo (placeholder until plugin repo is public; for now points at this docs repo).

ES landing mirrors structure, copy translated.

## 10. Avatar asset

Generated by `gpt-image` skill: man, late 30s, dark shirt, three-quarter facing, dramatic dark gradient background (`#0F1219` → `#1A1F2B`), audio waves emerging from mouth in violet→cyan gradient. Multiple resolutions committed to `public/avatar/`. Re-runnable when we want variations.

## 11. CI / deploy

`.github/workflows/deploy.yml`:
- Triggers on push to `main`.
- `actions/checkout`, `actions/setup-node@v4` (node 20), `npm ci`, `npm run build`.
- Pre-build step: grep gate for sanitization (fails if `.cpp` or `Source/` slips in).
- `actions/configure-pages`, `actions/upload-pages-artifact` (`./dist`), `actions/deploy-pages`.
- One job, no matrix. Pages enabled with source = "GitHub Actions".

## 12. Out of scope for v1

- Light theme.
- Search beyond Pagefind defaults.
- Versioned docs (single "current" version).
- Authenticated content.
- Analytics.
- Sitemap submission.
- Internal specs (`00-09`).
- Custom domain.
