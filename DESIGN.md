---
name: snip
status: first-draft
colors:
  canvas: "#fffdf9"
  surface: "#f5f4f0"
  hairline: "#e6e3dc"
  input-border: "#8a8a82"
  ink: "#1a1a1a"
  ink-muted: "#6b6b6b"
  action: "#2563eb"
  action-hover: "#1d4ed8"
  action-tint: "#eef2ff"
  on-action: "#ffffff"
  status-red: { dot: "#d92d20", bg: "#fdecea", ink: "#9b1c1c" }
  status-amber: { dot: "#c2680a", bg: "#fff3d6", ink: "#7a4100" }
  status-neutral: { dot: "#6b6b6b", bg: "#ecebe6", ink: "#4a4a4a" }
typography:
  page-title: { family: "EB Garamond", size: 30px, weight: 500, lineHeight: 36px, tracking: "-0.01em", mobile: "24px / 30px" }
  section-title: { family: "Figtree", size: 16px, weight: 600, lineHeight: 24px }
  body: { family: "Figtree", size: 15px, weight: 400, lineHeight: 22px }
  label: { family: "Figtree", size: 13px, weight: 500, lineHeight: 18px }
  caption: { family: "Figtree", size: 12px, weight: 400, lineHeight: 16px, tracking: "0.01em" }
  number: { family: "IBM Plex Mono", size: 14px, weight: 400, lineHeight: 20px, features: "tabular-nums" }
  number-lg: { family: "IBM Plex Mono", size: 24px, weight: 500, lineHeight: 30px, tracking: "-0.01em", features: "tabular-nums" }
radii: { badge: 4px, input: 6px, card: 10px, sheet: 14px, pill: 9999px }
spacing: { 1: 4px, 2: 8px, 3: 12px, 4: 16px, 5: 20px, 6: 24px, 8: 32px, 12: 48px }
shadows:
  overlay: "0 8px 24px rgba(26,26,26,0.10), 0 1px 2px rgba(26,26,26,0.06)"
  none-at-rest: "none"
breakpoints: { md: 768px, lg: 1024px }
---

# Design System: Snip (first draft)

> Tokens above are the source of truth. Map them to Tailwind v4 theme variables and shadcn/ui CSS variables on
> `:root`; never write a colour literal in a component. Light mode only. The product name lives only in
> `src/config/brand.ts`.

## 1. Overview

**North star: "a clean index card on a warm desk."** A single quiet page: warm paper, black ink, hairline rules, and
one blue that means "you can press this". Colour appears only when it carries meaning. Derived from the owner's
travel-crm system with green, violet and forest removed.

Principles: colour carries meaning, not decoration; dense but calm; mobile first (design at 360px); numbers are
first-class; honest empty, loading and error states.

## 2. Colour

| Role | Value | Used for (and only for) |
| --- | --- | --- |
| Canvas | `#fffdf9` | Page background, sheet background |
| Surface | `#f5f4f0` | Inset wells, skeletons, row hover |
| Hairline | `#e6e3dc` | Dividers, card and list borders (decorative only) |
| Input border | `#8a8a82` | Input and secondary-button outlines (3.4:1) |
| Ink / ink muted | `#1a1a1a` / `#6b6b6b` | Text / secondary text, placeholders |
| **Action blue** | `#2563eb`, hover `#1d4ed8`, tint `#eef2ff` | Primary button, links, focus ring, selected chip, chart bars, proportion bars |
| Status red | dot `#d92d20`, bg `#fdecea`, ink `#9b1c1c` | Errors only |
| Status amber | dot `#c2680a`, bg `#fff3d6`, ink `#7a4100` | "Expires in …" under 24 h; the rate-limit alert |
| Status neutral | dot `#6b6b6b`, bg `#ecebe6`, ink `#4a4a4a` | "Expired" |

Rules:

- **One Action Colour.** Blue is the primary interactive colour. Exception (owner, 2026-11-06): the `ink` button (black fill, canvas text) for secondary navigation such as "View all links".
- **No green, anywhere.** Success is said in words ("Link created") and shown by the result itself.
- **Status is dot plus word**, never colour alone. Tinted surfaces carry their own dark ink, never muted grey.
- Chart and proportion bars are action blue on a surface track; there is only one series.

## 3. Typography

| Role | Font | Size / line | Weight |
| --- | --- | --- | --- |
| Page title (`h1`, once) | EB Garamond | 30/36 (24/30 below 768px) | 500 |
| Section title | Figtree | 16/24 | 600 |
| Body | Figtree | 15/22 | 400 |
| Label | Figtree | 13/18 | 500 |
| Caption | Figtree | 12/16 | 400 |
| Number, slug, short URL, list date | IBM Plex Mono, `tabular-nums` | 14/20 | 400 |
| Number large (KPI) | IBM Plex Mono, `tabular-nums` | 24/30 | 500 |

Garamond only for the single `h1`. Inputs are 16px (no iOS zoom). Minimum text 12px. `text-wrap: balance` on titles,
`pretty` on prose. No uppercase tracked eyebrows, no gradient text. Load all three with `next/font/google`
(`--font-sans` Figtree, `--font-mono` IBM Plex Mono, `--font-display` EB Garamond).

## 4. Spacing, shape, layout

- 4px scale (4, 8, 12, 16, 20, 24, 32, 48). Tight inside a row (8–12), looser between groups (24–32).
- One content column, max 768px, centred. Side gutter 16px (phone), 24px (≥768), 32px (≥1024).
- Radii: buttons and chips are pills; inputs 6px; badges 4px; cards/panels 10px; sheets 14px (top corners on the
  bottom sheet, left corners on the side sheet).
- Touch targets ≥ 44×44px, ≥ 8px apart. Hairline 1px borders. No side-stripe borders. No nested cards.

## 5. Elevation and motion

Flat at rest: no shadow on cards, rows, buttons or inputs. The overlay shadow only on the sheet, toasts and popovers;
the sheet's scrim is `rgba(26,26,26,0.40)`. Motion is ease-out `cubic-bezier(0.22, 1, 0.36, 1)`, 120–200ms (sheet up
to 240ms), opacity and transform only, all behind `motion-safe:`. No bounce, no list entrance animations.

## 6. Components

- **Buttons.** Pill, 44px high. Primary: blue fill, white text; hover `#1d4ed8`; one per region. Secondary: canvas
  fill, input-border outline, ink text (Copy, Share, Load more, Retry). Ghost: no border, blue text. Loading: spinner
  replaces the label, width stays, disabled.
- **Inputs.** 44px, 16px text, 6px radius, `#8a8a82` border, canvas fill, visible label above. Focus: 2px blue ring,
  2px offset. Error: red border, message below with an icon, linked by `aria-describedby`.
- **Expiry chips.** A single-choice row of pills (Never, 1 hour, 24 hours, 7 days, 30 days, Custom), wrapping on
  phones. Unselected: hairline border, ink. Selected: blue tint, blue-hover ink, check icon. Custom reveals a native
  date-and-time input.
- **Badges.** 4px radius, tinted bg, dark ink, 6px dot, then the word (12–13px, 500).
- **Link rows.** Each row is one link-button (≥ 44px) to `?link=<slug>`. Phone: two lines (slug + clicks; target,
  date, expiry). ≥768px: one line with columns Slug · Target · Clicks · Created · Expires, plus a header row. Hairline
  dividers, surface on hover, no zebra.
- **Detail sheet.** Bottom sheet below 768px (max height 90dvh, drag handle, scrolls inside), right side sheet at
  ≥768px (width 480px). Header: short URL (mono) with Copy and Share; target URL wraps, never truncates.
- **Numbers strip.** Three KPIs in a hairline-divided strip (not three boxes): label (caption), value (number-lg).
- **Chart.** 30 vertical bars, action blue, surface track, muted axis labels (first, middle, last date), a visually
  hidden table with the same numbers.
- **Breakdown lists.** Name, mono count right-aligned, thin blue proportion bar under the name.
- **Toasts.** Bottom-centre on phones, bottom-right on desktop, 4s, `role="status"`; errors persist with a dismiss.
- **Empty / loading / error.** Empty: one sentence plus what to do. Loading: skeletons in the final layout (surface
  tone, subtle pulse behind `motion-safe`). Error: what failed plus Retry; keep the user's input.

## 7. Do's and Don'ts

Do: blue for every interactive affordance and nothing else; mono tabular numbers; dot plus word for status; plain,
specific copy; real empty, loading and error states.

Don't: green, violet or any decorative colour; gradients, glassmorphism, blur; eyebrows; hero-metric blocks; identical
icon-card grids; shadows at rest; placeholders as labels; colour alone for meaning; Garamond outside the `h1`.

## 8. Accessibility

WCAG 2.2 AA. Ink on canvas 17.1:1; muted on canvas 5.25:1; white on blue 5.17:1; blue on canvas 5.09:1; blue-hover on
tint 5.99:1; status inks on their tints ≥ 7:1; input border 3.42:1 (UI boundary). Visible focus everywhere; logical
tab order; the sheet traps and restores focus and closes on Escape; icon-only buttons are named; toasts and the
rate-limit countdown live in polite live regions (announce the countdown at start and at zero, not every second).
