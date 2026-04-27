# AvatarDirector docs

Public documentation site for the **AvatarDirector** Unreal Engine 5.7 plugin — real-time MetaHuman control over a single TCP socket.

Live at: **https://sgeraldes.github.io/avatardirector-docs/**

> **Scope.** This repository is *only* the documentation site — the marketing landing, protocol reference, integrator guides, and release notes. It is intentionally public so backend / integrator teams can read and link to the source of truth. **The AvatarDirector plugin itself is proprietary and is not published in this repository or anywhere else on GitHub.** It is being prepared for distribution through the Unreal **Fab Marketplace** (formerly the Unreal Marketplace). No plugin source, headers, binaries, or sample assets live here — only docs.

## Stack

- [Astro 6](https://astro.build/) + [Starlight](https://starlight.astro.build/)
- [Tailwind CSS v4](https://tailwindcss.com/) for the marketing landing
- Inter (variable, self-hosted) for typography
- Bilingual (EN default, ES at `/es/`)
- Static output, deployed to GitHub Pages by GitHub Actions

## Local development

```bash
npm install
npm run dev      # starts the dev server at http://localhost:4321
npm run build    # outputs static site to ./dist
npm run preview  # serves the built ./dist locally
```

## Project layout

```
src/
├── assets/             # Logos and inline-imported images
├── components/         # Astro components used by the landing pages
├── content/docs/       # Starlight markdown — EN docs (root), ES under es/
├── layouts/            # Custom Astro layout for the landings
├── pages/              # Custom Astro pages (/, /es/) — non-Starlight
└── styles/global.css   # Design tokens + Starlight theme overrides
public/
├── avatar/             # Hero image and other generated assets
└── favicon.svg
```

## Adding a doc page

1. Add the markdown file under `src/content/docs/` for EN, and `src/content/docs/es/` for ES (mirrored slug).
2. Add an entry to the `sidebar` in `astro.config.mjs` with a `translations: { es: '...' }` label.
3. `npm run build` to verify.

## Sanitization rule

This site documents the public surface of the plugin only. No `.cpp` / `.h` filenames, no source-line citations, no `Source/` paths. The build CI fails if any of those slip into a markdown file.
