# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16 App Router, tRPC 11, TanStack Query 5, Tailwind v4 + shadcn/ui (Radix), lucide icons, running on
Cloudflare Workers through OpenNext. Chosen by the owner and the hiring team's stack; not open for change.

## Users

One person at a time (`user_demo`, no sign-in in v1) who shortens links to share them: in chats, posts, emails. They
are usually on a phone, pasting a link they just copied, and want the short link copied back out within seconds. Later
they come back to see whether anyone clicked.

## Product Purpose

A minimal link shortener: paste an https link, pick when it should stop working, get a 7-character short link, see how
each link performs (clicks over time, where they came from, which countries and devices). It is a take-home for a
full-stack role, graded on judgment and explainability, so the product must be small, clean and obviously correct.

## Positioning

Fast and honest. Redirects are near-instant from the edge; numbers are real and say how fresh they are. No growth
tricks, no clutter, nothing the person didn't ask for.

## Operating Context

- One page: make a link at the top, your links below. Tapping a link opens its details in a sheet (bottom on phones,
  side on desktop); the URL carries `?link=<slug>` so Back closes it.
- Link expiry is chosen at creation: Never (default), 1 hour, 24 hours, 7 days, 30 days, or a custom date and time.
- Creating is limited to 5 links a minute; the sixth attempt shows how many seconds to wait.
- Click counts and analytics can lag a few seconds behind real clicks.

## Capabilities and Constraints

- Only `https://` links are accepted; `http://` is rejected with a message, never upgraded.
- Links can't be edited or deleted in v1.
- Light mode only in v1.
- Mobile first: designed at 360px, then 768px and 1024px.

## Brand Commitments

- **Name:** working name "Snip", kept in one constant (`src/config/brand.ts`); never hard-coded elsewhere.
- **Look:** the warm, quiet ledger feel of the owner's travel-crm design system: warm paper canvas, black ink,
  hairline rules, one blue for everything clickable. **No green** (owner's decision).
- **Never like:** a generic SaaS dashboard (gradients, purple-blue, rows of identical icon cards), a cluttered
  link-management console, or marketing chrome inside the tool.

## Evidence on Hand

- Owner's reference design system: `../travel-crm/DESIGN.md` (tokens reused, minus green, violet and forest).
- Spec: `docs/superpowers/specs/2026-11-06-url-shortener-design.md`, section 10.

## Product Principles

- One clear action per screen region; the primary button is the only filled blue thing in view.
- Numbers are first-class: mono, tabular, right-aligned.
- Honest states: every list and form has real empty, loading and error states.
- Copy is plain and specific ("Expires in 3 h", not "Action required").

## Accessibility & Inclusion

WCAG 2.2 AA. 44px touch targets, visible 2px blue focus ring, full keyboard use, one `h1`, labelled icon buttons,
toasts in a live region, motion only behind `prefers-reduced-motion: no-preference`, inputs at 16px so iOS doesn't zoom.
