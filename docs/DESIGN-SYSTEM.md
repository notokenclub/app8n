# Zelleo design system in app8n

The interface is built entirely from the Zelleo design system. This note says
where the system lives, what the rules are, and how they are enforced.

## Where it lives

| Path | What it is |
| --- | --- |
| `src/ds/tokens/*.css` | The token sheets: fonts, colours, typography, spacing, radii, shadows. |
| `src/ds/styles.css` | The system's own aggregator for those sheets. |
| `src/ds/components/**`, `src/ds/assets/icons/**` | The system's component and icon sources, vendored unmodified. |
| `src/ds/index.js` | **The only entry point.** Everything imports primitives from `@/ds`. |
| `src/ds/index.d.ts` | Types for that barrel, mirroring the prop contracts below. |
| `src/ds/_adherence.oxlintrc.json` | The rules, as shipped with the system. |
| `public/fonts/*.ttf` | Self-hosted Cabin, Cabin Condensed, Cabin SemiCondensed. |

`src/app/globals.css` imports the six token sheets ahead of everything else and
maps them onto the Tailwind theme, so `bg-background`, `text-muted`,
`rounded-md` and `p-space-lg` all resolve to design-system tokens. Nothing in
the app defines a colour, spacing step, radius or font of its own.

Two details in that file are load-bearing:

* The design system's colour names are exposed through a plain `@theme`, not
  `@theme inline`. The utilities then compile to `var(--color-ink)` rather
  than to the ramp value behind it, which is what lets the charcoal theme
  re-point those tokens.
* The charcoal theme (`.dark`) re-points the system's own surface and text
  tokens — `--color-canvas`, `--color-ink`, `--color-hairline` and friends —
  onto the ink end of the ramp, and Tailwind's roles follow the same tokens.
  Because `src/ds` components read `var(--color-*)` directly, they turn with
  the theme instead of staying white cards on a dark page.

**Never pass `style` to a design-system component.** They render
`<el style={style} {...rest}>`, so a `style` prop replaces their inline style
wholesale and the component loses its appearance. Size and position them from
the parent (a flex row with `[&>*]:flex-1`, for example).

## The rules

* **No raw values.** No hex, `rgb()`, px spacing or px radii in app code —
  colours come from `var(--color-*)`, spacing from `var(--space-*)` (or the
  `*-space-xs … *-space-section` utilities), radii from `var(--radius-*)`.
* **Typography.** `var(--font-sans)` is **Manrope** (400/500/600/700) — the
  product's UI face for body copy, controls, inputs and labels. Cabin, which
  the system shipped with, stays as the self-hosted fallback behind it.
  `var(--font-display)` (Cabin Condensed, weight 500–600) still carries
  headlines and `var(--font-mono)` (JetBrains Mono) logs, keys and code.
  Manrope and JetBrains Mono load from the Google Fonts CDN via a `<link>` in
  the root layout; sizes always come from the scale tokens.
  `_adherence.oxlintrc.json` lists Manrope among the allowed families, so the
  override is enforced rather than excepted.
* **Components.** Buttons, badges, inputs, switches, tiles, messages, dividers,
  icons and charts come from `@/ds`. The shadcn primitives they replaced were
  deleted; `skeleton`, `textarea` and the `sonner` toaster remain because the
  system has no equivalent, and they are styled from tokens.
* **Icons.** `<Icon name="…" size={16} />` only, from the system's curated
  75-glyph set. No icon library, no emoji, anywhere.
* **Tone.** Sentence case everywhere. Flat colour blocks for emphasis — no
  shadows, gradients, blur or glass. Engineering-first copy: state what runs.

## Enforcement

`npm run lint:ds` runs `scripts/ds-adherence.mjs`, which reads
`_adherence.oxlintrc.json` and enforces it over `src` (the vendored `src/ds`
sources are the specification, not a subject of it). oxlint itself cannot run
the config: it does not implement `no-restricted-syntax`, which is the rule
carrying almost all of the system's constraints.

The script checks raw hex and px literals, non-system font families, imports
that reach into component internals, and each component's declared props and
enum values. Three carve-outs are deliberate and marked in the source: ARIA
attributes (an icon-only control needs an accessible name), the native
attributes that `Button`, `IconButton` and `Input` forward through `...rest`
and that carry behaviour predating the system (the button `type`, and
`type`/`inputMode`/`autoComplete`/`spellCheck`/`onKeyDown` on the password
field), and measurements that are not design values — a media-query breakpoint, a
`env(safe-area-inset-*)` fallback, and `#`-prefixed text that is not a colour.

## Known gaps to take back to the design system

* The curated icon set stops alphabetically at `OfficeBuilding` — there is no
  search, send, settings, play, pause or person glyph. Those places currently
  reuse the nearest available glyph (for example `Filter` for search,
  `Megaphone` for dictation, `Component` for settings).
* The system defines no dark palette. The charcoal theme therefore re-points
  the system's surface and text tokens onto the ink ramp (see above), which
  works, but the values are this app's reading of the system rather than the
  system's own. `SectionMessage` keeps its fixed pastel appearances in both
  themes — legible, but worth a decision from the design side.
* There is no `Table`, no `Modal` and no `Skeleton` in the system; the last of
  those is still the shadcn primitive, restyled from tokens.
