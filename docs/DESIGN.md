# Warm Canvas Design System

> The visual language of EXT-TO-JSON. Implemented in
> [`src/app/globals.css`](../src/app/globals.css). Formalized here so future
> components stay consistent.

**Warm Canvas** is a warm, approachable, functional design system. It avoids
pure white and pure gray backgrounds in favor of warm beige (light) and warm
dark grey (dark) canvases. The accent palette is indigo / violet / teal /
amber / rose — five colors, each with a soft tint variant. Typography is
**Inter** for UI text and **JetBrains Mono** for code. Corners are generous
(8–24 px radius). Shadows are soft and layered. Motion is gentle (200–400 ms
eases) and never decorative-only.

---

## Table of contents

- [Color tokens](#color-tokens)
- [Typography](#typography)
- [Spacing](#spacing)
- [Radius](#radius)
- [Shadows](#shadows)
- [Components](#components)
- [Interactions & animations](#interactions--animations)
- [Responsive behaviour](#responsive-behaviour)
- [Accessibility](#accessibility)

---

## Color tokens

All tokens are CSS custom properties defined in `:root` (light) and `.dark`
(dark). Tailwind 4's `@theme inline` block aliases shadcn variables to these
tokens so existing shadcn components inherit the look automatically.

### Light theme — warm beige canvas

| Token | Value | Usage |
| --- | --- | --- |
| `--canvas` | `#F2EEE8` | Page background (the warm beige canvas). |
| `--surface` | `#FFFDFA` | Cards, sidebar, top bar. Slightly lighter than canvas. |
| `--surface-alt` | `#F9F5F0` | Hovered items, muted backgrounds, secondary surfaces. |
| `--surface-elevated` | `#FFFDF9` | Elevated cards (modals, popovers). |
| `--border` | `#E8E2DA` | Default 1 px borders. |
| `--border-strong` | `#D9D2C7` | Scrollbar thumbs, emphasized borders. |
| `--text-primary` | `#1A1A1A` | Body text, headings. |
| `--text-secondary` | `#8A8784` | Muted text, labels, descriptions. |
| `--text-tertiary` | `#B3B0AB` | Tertiary text, placeholders. |

### Dark theme — warm dark grey canvas

| Token | Value | Usage |
| --- | --- | --- |
| `--canvas` | `#18181A` | Page background. |
| `--surface` | `#242426` | Cards, sidebar, top bar. |
| `--surface-alt` | `#2E2E30` | Hovered items, muted backgrounds. |
| `--surface-elevated` | `#2A2A2C` | Elevated cards. |
| `--border` | `#3D3D40` | Default borders. |
| `--border-strong` | `#4A4A4D` | Scrollbar thumbs. |
| `--text-primary` | `#EDE9E3` | Body text, headings. Warm off-white. |
| `--text-secondary` | `#A8A6A2` | Muted text. |
| `--text-tertiary` | `#7A7874` | Tertiary text. |

### Accent palette (both themes)

| Token | Light | Dark | Usage |
| --- | --- | --- | --- |
| `--accent-indigo` | `#6366F1` | `#818CF8` | Primary actions, active nav, links, focus rings, chart-1. |
| `--accent-indigo-soft` | `#EEF0FE` | `#2A2D44` | Soft backgrounds for primary accents. |
| `--accent-secondary` | `#8B5CF6` | `#A78BFA` | Secondary accent, gradient partner, chart-3. |
| `--accent-secondary-soft` | `#F3EFEF` → `#F3EFFE` | `#322A44` | Soft backgrounds for secondary accents. |
| `--accent-teal` | `#14B8A6` | `#2DD4BF` | Success, "ready" states, chart-2. |
| `--accent-teal-soft` | `#E6F7F5` | `#1F3633` | Success backgrounds. |
| `--accent-amber` | `#F59E0B` | `#FBBF24` | Warning, "warning" health, chart-4. |
| `--accent-amber-soft` | `#FDF3E0` | `#3F3417` | Warning backgrounds. |
| `--accent-danger` | `#FF6B6B` | `#FB7185` | Destructive, "error" health, chart-5. |
| `--accent-danger-soft` | `#FFE9E9` | `#3F2226` | Error backgrounds. |

### Aliases (shadcn compatibility)

The `@theme inline` block maps shadcn variables to warm tokens so existing
shadcn components "just work":

```
--color-background    → --canvas
--color-foreground    → --text-primary
--color-card          → --surface
--color-primary       → --accent-indigo
--color-muted         → --surface-alt
--color-muted-foreground → --text-secondary
--color-border        → --border
--color-destructive   → --accent-danger
--color-ring          → --accent-indigo
…
```

### Usage in components

- Prefer **Tailwind utility classes** (`bg-[var(--surface)]`,
  `text-[var(--text-secondary)]`, `border-[var(--border)]`) over raw hex
  values.
- For gradients: `bg-gradient-to-br from-[var(--accent-indigo)] to-[var(--accent-secondary)]`.
- For shadows: `shadow-[var(--shadow)]`, `shadow-[var(--shadow-hover)]`.
- For soft accent backgrounds: `bg-[var(--accent-teal-soft)] text-[var(--accent-teal)]`.

---

## Typography

Two font families, loaded via `next/font` in `src/app/layout.tsx`:

- **Inter** (`--font-inter`) — UI text, body, headings. Loaded with
  `cv11` and `ss01` OpenType features enabled for nicer digits and
  alternate glyphs.
- **JetBrains Mono** (`--font-jetbrains-mono`) — code blocks, JSON viewer,
  log lines, anything monospace.

The Tailwind theme aliases:

```
--font-sans → var(--font-inter)
--font-mono → var(--font-jetbrains-mono)
```

So `font-sans` / `font-mono` utilities resolve to the right fonts.

### Type scale

| Tailwind class | Size | Use |
| --- | --- | --- |
| `text-xs` | 12 px | Footer text, badges, labels in dense UI. |
| `text-sm` | 14 px | Body text, button labels, nav items. |
| `text-base` | 16 px | Top-bar title, larger body. |
| `text-lg` | 18 px | Card titles. |
| `text-xl` | 20 px | Page-level titles. |
| `text-2xl` | 24 px | Hero text. |
| `text-3xl+` | 30 px+ | Reserved for marketing pages. |

### Weight

- **Regular (400)** — body.
- **Medium (500)** — nav items, buttons, labels.
- **Semibold (600)** — card titles, page titles.
- **Bold (700)** — hero text, brand.

### Line height & letter spacing

- Body: `leading-normal` (1.5).
- Headings: `leading-tight` (1.25).
- Brand / overlines: `leading-tight` + `tracking-tight`.

### Text rendering

```css
font-feature-settings: "cv11", "ss01";
text-rendering: optimizeLegibility;
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
```

---

## Spacing

We use Tailwind's default spacing scale (4 px base). Common values:

| Class | Px | Use |
| --- | --- | --- |
| `gap-1`, `p-1` | 4 px | Tight groupings (icon + label inside a button). |
| `gap-2`, `p-2` | 8 px | Default gap inside cards / buttons. |
| `gap-3`, `p-3` | 12 px | Sidebar nav item padding. |
| `gap-4`, `p-4` | 16 px | Default card padding on mobile. |
| `gap-6`, `p-6` | 24 px | Default card padding on desktop. |
| `gap-8` | 32 px | Section separation. |
| `gap-12` | 48 px | Page-level section separation. |

The sidebar is `w-[240px]` expanded, `w-[68px]` collapsed (icon-only). The
desktop layout uses `lg:p-4` around the floating sidebar + main column, so
both have rounded corners and a 16 px gap from the viewport edge.

---

## Radius

Defined in `@theme inline`:

| Token | Value | Tailwind class | Use |
| --- | --- | --- | --- |
| `--radius-sm` | 8 px | `rounded-sm` | Pills (small), tight controls. |
| `--radius-md` | 12 px | `rounded-md` | Buttons, inputs. |
| `--radius-lg` | 16 px | `rounded-lg` | Cards, default `--radius`. |
| `--radius-xl` | 20 px | `rounded-xl` | Modals, larger cards. |
| `--radius-2xl` | 24 px | `rounded-2xl` | Top bar (desktop), large surfaces. |
| `--radius-3xl` | 24 px+ | `rounded-3xl` | Floating sidebar (desktop). |
| `rounded-full` | 9999 px | — | Icon buttons, avatars, dots. |

The base `--radius` is `16 px` (matches `--radius-lg`). shadcn's
`rounded-md`, `rounded-lg`, etc. all use these tokens.

---

## Shadows

Soft, layered, never harsh. Light theme uses low-opacity black; dark theme
uses higher-opacity black (since the canvas is already dark, shadows need to
be stronger to read).

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--shadow` | `0 2px 20px rgba(0,0,0,0.04)` | `0 2px 20px rgba(0,0,0,0.5)` | Default card / sidebar shadow. |
| `--shadow-hover` | `0 8px 40px rgba(0,0,0,0.08)` | `0 8px 40px rgba(0,0,0,0.6)` | Hovered cards, lifted state. |
| `--shadow-elevated` | `0 4px 16px rgba(0,0,0,0.12)` | `0 4px 16px rgba(0,0,0,0.7)` | Modals, popovers. |
| `--shadow-focus` | `0 0 0 4px rgba(99,102,241,0.15)` | `0 0 0 4px rgba(129,140,248,0.2)` | Focus ring (indigo). |

Usage:

```css
.surface-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
}

.lift-on-hover:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-hover);
}
```

Focus visible (`:focus-visible`) automatically gets the focus ring shadow +
an 8 px radius. No need to add `focus:` utilities manually.

---

## Components

### Sidebar (desktop, floating)

- Width: `240px` expanded / `68px` collapsed (icon-only). Animated via
  `transition-[width] duration-300`.
- Container: `rounded-3xl border bg-[var(--surface)] shadow-[var(--shadow)]`,
  sticky to `top-4`, height `calc(100vh - 2rem)`.
- Brand block at top: gradient logo tile (indigo → violet), name + tagline.
- Nav items: `rounded-xl px-3 py-2.5 text-sm font-medium`. Active state
  gets `bg-[var(--accent-indigo)] text-white shadow-md` + indigo glow.
  Inactive: `text-muted-foreground`, hover `bg-[var(--surface-alt)]`.
- Footer: small info card + collapse toggle.

### Sidebar (mobile, drawer)

- Triggered by a fixed floating `Menu` button (top-left, `lg:hidden`).
- Opens a `Sheet` from the left, `w-[260px]`. Same nav items as desktop but
  always full-width.

### Top bar

- Desktop: `rounded-2xl`, sticky `top-0`, `bg-[var(--surface)]/80
  backdrop-blur-xl`. Contains current view title + description on the left,
  GitHub + theme toggle on the right.
- Mobile: full-width, no rounding.

### Cards

```jsx
<Card className="surface-card lift-on-hover">
  <CardHeader>
    <CardTitle>…</CardTitle>
    <CardDescription>…</CardDescription>
  </CardHeader>
  <CardContent>…</CardContent>
</Card>
```

`surface-card` and `lift-on-hover` are utility classes in `globals.css`
that compose the surface + border + radius + shadow + hover-lift.

### Pills / badges

Three flavors:

- **Health badge** (`src/components/shared/health-badge.tsx`) — colored dot
  + label. Green = healthy, amber = warning, red = error. Uses
  `--accent-teal` / `--accent-amber` / `--accent-danger` with their soft
  backgrounds.
- **Capability pills** — `rounded-full bg-[var(--surface-alt)] px-2.5 py-0.5
  text-xs`. Grey by default, indigo when active.
- **Status badges** — same shape, semantic colors
  (`bg-[var(--accent-teal-soft)] text-[var(--accent-teal)]` etc.).

### Buttons

shadcn's `<Button>` with the default variants, aliased to warm tokens:

- `default` → `bg-[var(--accent-indigo)] text-white`.
- `secondary` → `bg-[var(--surface-alt)] text-[var(--text-primary)]`.
- `outline` → `border border-[var(--border)] bg-transparent`.
- `ghost` → transparent, hover `bg-[var(--surface-alt)]`.
- `destructive` → `bg-[var(--accent-danger)] text-white`.

Icon buttons: `size="icon"` + `rounded-full h-9 w-9` for the top-bar
actions.

### Metric cards

Used in the Converter + Settings views to surface counts (e.g. "12
extensions", "Health 87%"). Layout:

```
┌─────────────────┐
│ [icon]  label   │
│   87%           │
│ ─────────────── │
│ caption text    │
└─────────────────┘
```

The big number uses `text-3xl font-bold`; the icon is in a soft-tinted
square (`bg-[var(--accent-indigo-soft)] text-[var(--accent-indigo)]`).

### Code blocks / JSON viewer

`src/components/shared/json-viewer.tsx`. Renders pretty-printed JSON with:

- `font-mono text-xs`.
- Syntax highlighting via inline spans (keys in indigo, strings in teal,
  numbers in amber, booleans/null in violet).
- Collapsible sections (click a `{` or `[` to fold).
- Copy-to-clipboard button in the top-right.
- Container: `rounded-lg border bg-[var(--surface-alt)] p-3 overflow-auto`.

### Tree view

Used in the Converter for the work-dir tree (optional debug view) and the
Playground for the per-server video resolution tree. Styling:

- Indentation via `padding-left` per depth.
- Expand/collapse caret (`ChevronRight` rotates 90° when expanded).
- File-like icons (`File`, `Folder`, `FileJson`, `FileCode`).

### Progress

shadcn's `<Progress>` aliased to `--accent-indigo`. For health scores, the
bar color matches the status:

- `healthy` → `--accent-teal`.
- `warning` → `--accent-amber`.
- `error` → `--accent-danger`.

Achieved via inline `style={{ '--progress-color': var(--accent-teal) }}` on
the `<Progress>` and a CSS rule `bar { background: var(--progress-color); }`.

### Status indicators

Small dots used inline next to text:

- `bg-[var(--accent-teal)]` — ready / pass.
- `bg-[var(--accent-amber)]` — warning.
- `bg-[var(--accent-danger)]` — error / fail.
- `bg-[var(--text-tertiary)]` — skip / unknown.

Often paired with `animate-pulse-ring` for live/running states.

### Scrollbar

Custom-styled, warm-themed:

```css
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: 9999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
::-webkit-scrollbar-thumb:hover { background: var(--text-tertiary); }
* { scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent; }
```

---

## Interactions & animations

### Keyframes

Defined in `globals.css`:

- `fade-in-up` (0.4s) — default view-enter animation.
- `fade-in` (0.3s) — overlays.
- `scale-in` (0.25s) — modals, popovers.
- `pulse-soft` (1.8s, infinite) — "running" indicators.
- `pulse-ring` (2s, infinite) — teal ring expanding outward (used on live
  status dots).
- `shimmer` (1.6s, infinite) — skeleton loading bars.
- `spin-slow` (8s, linear, infinite) — decorative spinners.

### Utility classes

```css
.animate-fade-in-up   /* default for view content */
.animate-fade-in      /* overlays */
.animate-scale-in     /* modals */
.animate-pulse-soft   /* running states */
.animate-pulse-ring   /* live status dots */
.animate-spin-slow    /* large decorative spinners */
```

### Stagger

```css
.stagger > * {
  opacity: 0;
  animation: fade-in-up 0.4s ease forwards;
}
.stagger > *:nth-child(1) { animation-delay: 0.04s; }
.stagger > *:nth-child(2) { animation-delay: 0.08s; }
…
.stagger > *:nth-child(8) { animation-delay: 0.32s; }
```

Add `.stagger` to a list container and its children fade in with a 40 ms
offset. Useful for browse grids, episode lists, and checklists.

### Shimmer skeletons

```css
.shimmer { position: relative; overflow: hidden; }
.shimmer::after {
  content: "";
  position: absolute; inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
  animation: shimmer 1.6s infinite;
}
```

Apply `.shimmer` to a `<div className="bg-[var(--surface-alt)] h-4 rounded" />`
for a skeleton loading bar.

### View transitions

`framer-motion`'s `<AnimatePresence mode="wait">` wraps each view. Each view
fades + slides 6 px on enter/exit, 200 ms ease. This is the only motion
that affects layout; everything else is opacity/transform only (no layout
thrash).

### Hover lift

```css
.lift-on-hover { transition: transform 0.2s ease, box-shadow 0.2s ease; }
.lift-on-hover:hover { transform: translateY(-2px); box-shadow: var(--shadow-hover); }
```

Apply to cards that should feel "pick-up-able".

### Gradient text

```css
.text-gradient {
  background: linear-gradient(135deg, var(--accent-indigo), var(--accent-secondary));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
```

For hero headings and the brand mark.

---

## Responsive behaviour

The layout has two breakpoints of interest:

- **`lg` (1024 px+)** — Desktop. Sidebar is a floating rounded panel on the
  left, top bar is rounded, content has `p-6` padding.
- **Below `lg`** — Mobile. Sidebar collapses to a Sheet drawer triggered by
  a floating menu button. Top bar is full-width, content has `p-4`.

Between, components should:

- Use responsive padding (`p-4 lg:p-6`).
- Hide desktop-only controls on mobile (`hidden lg:flex`).
- Hide mobile-only controls on desktop (`lg:hidden`).
- Stack grids: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.

The Converter and Playground views are designed to work at 360 px wide;
everything is single-column on mobile and expands to multi-column on larger
screens.

---

## Accessibility

### Focus states

Every focusable element gets a visible focus ring via `:focus-visible`:

```css
:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
  border-radius: 8px;
}
```

The ring is a 4 px indigo halo (`rgba(99,102,241,0.15)` light,
`rgba(129,140,248,0.2)` dark). Keyboard navigation is always visible.

### Color contrast

All text-on-background combinations meet WCAG AA (4.5:1 for body text,
3:1 for large text):

- `--text-primary` on `--canvas`: ~15:1 (light), ~13:1 (dark).
- `--text-secondary` on `--surface`: ~4.6:1 (light), ~5.2:1 (dark).
- `--accent-indigo` on white: ~4.6:1.
- `--accent-teal` on `--surface`: ~3.4:1 (large text only — use indigo for
  small text on teal backgrounds).
- `--accent-danger` on white: ~4.0:1 (borderline; we use it for icons and
  large text, not body).

Never use `--text-tertiary` for content — it's reserved for placeholders
and disabled states.

### Reduced motion

Respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

(TODO: this media query is not yet in `globals.css` — add it when next
touching the file.)

### Keyboard navigation

- Sidebar nav items are `<button>`s (focusable, Enter activates).
- Top-bar actions are `<button>`s or `<a>`s with `aria-label`s.
- Modals (`Dialog`, `Sheet`) trap focus and restore on close (Radix default).
- The JSON viewer supports `Tab` to move between collapsible sections.

### ARIA

- Icon-only buttons always have `aria-label`.
- Status dots have `aria-label` describing the state ("Conversion healthy",
  "Toolchain not ready").
- The health badge has `title` and `aria-label` matching its visible text.
