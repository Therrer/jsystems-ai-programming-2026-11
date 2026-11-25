# Design Guidelines — Eurocash-style brand

Reference extracted from <https://eurocash.pl/> on 2026-11-25 (desktop Chrome, ~920 px viewport, cookie banner dismissed). Machine-readable tokens live in [`assets/design-tokens.json`](../assets/design-tokens.json); this document explains how to use them.

> Brand assets (logos, favicon) belong to Eurocash S.A. Verify usage rights before using them outside internal course work.

## Assets

| File | Description |
|---|---|
| [`assets/homepage.png`](../assets/homepage.png) | Full-page reference screenshot (no overlays) |
| [`assets/logo.svg`](../assets/logo.svg) | Main wordmark "eurocash .pl — Twoje nowe możliwości" (viewBox 96×40) |
| [`assets/logo-eurocash360.svg`](../assets/logo-eurocash360.svg) | Secondary "eurocash360" logo with orange/lime arc (viewBox 155×40) |
| [`assets/favicon.ico`](../assets/favicon.ico) | 32×32 favicon (PNG data in `.ico` file) |
| [`assets/design-tokens.json`](../assets/design-tokens.json) | Design tokens (colors, type, spacing, radius, components) |
| [`assets/homepage-grupaeurocash/`](../assets/homepage-grupaeurocash/) | Related corporate site <https://www.grupaeurocash.pl> (2026-11-25), split into 7 section screenshots `01-hero.png` … `07-stopka.png` (920 px wide, ≤ 942 px tall). Context only: a separate corporate style (red/green "EUROCASH Grupa" logo, colored cards); tokens above come from eurocash.pl |

## Colors

### Brand

| Token | Hex | Usage |
|---|---|---|
| `brand.primary` | `#01983D` | Main brand green: left sidebar strip, text links ("Grupa Eurocash"), success states |
| `brand.primaryDark` | `#00813D` | Logo green; use for hover/pressed on green elements |
| `brand.primaryDeep` | `#005925` | Logo shadow tone; dark green accents |
| `brand.buttonGreen` | `#358F42` | Secondary button background ("Logowanie") |
| `brand.accent` | `#E67741` | Primary CTA orange ("Zarejestruj się") |
| `brand.logoRed` | `#EE3042` | ".pl" badge in the logo; also used as `brand.error` (derived) |
| `brand.orange360` / `brand.lime360` | `#FF7800` / `#71B739` | eurocash360 logo arc only, not general UI |

### Backgrounds

| Token | Hex | Usage |
|---|---|---|
| `background.default` | `#FFFFFF` | Header, cards, inputs |
| `background.light` | `#EDEDED` | Select/dropdown segment in the search box |
| `background.darker` | `#2E3441` | Search band under the header |
| `background.dark` | `#3D4455` | Footer |
| `background.sidebar` | `#01983D` | 35 px green strip down the left edge |
| `background.overlay` | `rgba(0,0,0,.3)` | Shadows / photo overlays |

### Text

| Token | Hex | Usage |
|---|---|---|
| `text.primary` | `#3D4455` | Default body text (slate navy, not black) |
| `text.onDark` | `#FFFFFF` | Headings on photos, button labels, search title |
| `text.onDarkSoft` | `#F3F3F5` | Footer text |
| `text.link` | `#01983D` | Inline/header links |
| `text.input` | `#000000` | Typed input text |
| `text.muted` | `#6B7280` | Placeholders/helper text (derived, not observed) |

## Typography

- **Primary family:** `Roboto, sans-serif`. Used for practically all text. The site declares no `@font-face` for Roboto and relies on a locally installed copy. In the app, load Roboto from Google Fonts (weights 200–700).
- **Secondary family:** `Figtree` (Google Fonts, weights 300–700). Used only in a few promo/banner elements. Optional.
- No fonts were downloaded into `assets/fonts/`. Both families are free on Google Fonts and should be linked from there.

### Weight scale

| Token | Value | Seen on |
|---|---|---|
| extralight | 200 | Footer list items & contact info |
| light | 300 | "Sprawdź ofertę" search title |
| regular | 400 | Body, inputs, select |
| medium | 500 | Hero subtitle (h2), hero links |
| semibold | 600 | Buttons, footer link headings |
| bold | 700 | Hero headline (h1), "Grupa Eurocash" link |

### Size scale

| Token | Size | Usage |
|---|---|---|
| xs | 13px | Search input text |
| sm | 15px | Footer CTA button |
| base | 16px | Buttons, header link, footer list |
| md | 18px | Search title, select, footer headings |
| lg | 28px | Hero category links ("Oferta dla sklepu ›") |
| xl | 34px | Hero subtitle (h2) |
| display | 66px | Hero headline (h1), line-height 60px |

Hero text is white, set on photography, with a soft text shadow for legibility.

## Spacing

The site uses a 4 px base grid. Observed values: 13/26 px button padding, 16 px container and search-band padding, 20 px vertical button margins, 25 px gap between header buttons.

| Token | Value |
|---|---|
| 1 | 4px |
| 2 | 8px |
| 3 | 12px |
| 4 | 16px (default container padding) |
| 5 | 20px |
| 6 | 24px |
| 7 | 28px |
| 8 | 32px |

## Border radius

| Token | Value | Usage |
|---|---|---|
| `leaf` | `10px 0px` | **Signature shape.** All buttons: top-left and bottom-right rounded, other corners square, echoing the leaf in the logo |
| `md` | `8px` | Search box container |
| `inputLeft` / `inputRight` | `8px 0 0 8px` / `0 8px 8px 0` | First/last segment of the segmented search box |
| `none` | `0` | Header, bands, footer, hero tiles |
| `full` / `circle` | `999px` / `50%` | Pills/avatars (not observed; for app use) |

## Components

### Header
White background, about 100 px tall. On the left are `logo.svg` (50 px high) and `logo-eurocash360.svg`. On the right are a bold green text link ("Grupa Eurocash", 16px/700, `#01983D`), the green **Logowanie** button and the orange **Zarejestruj się** button, 25 px apart.

### Buttons

| Variant | Background | Text | Border | Padding | Radius | Font |
|---|---|---|---|---|---|---|
| Primary (CTA) | `#E67741` | `#FFFFFF` | 1px solid `#E67741` | 13px 26px | `10px 0px` | 16px / 600 |
| Secondary | `#358F42` | `#FFFFFF` | 1px solid `#358F42` | 13px 26px | `10px 0px` | 16px / 600 |
| Text link | none | `#01983D` | none | 0 | 0 | 16px / 700 |

Button height is 46 px. There are no box shadows. Use orange for the single most important action on a screen and green for secondary or returning-user actions.

### Search band ("Sprawdź ofertę")
A full-width `#2E3441` band with 16 px padding. A white light-weight title (18px/300) sits next to a segmented white search box (53 px high, 8 px radius, shadow `0 0 10px rgba(0,0,0,.3)`). The box has three segments:
1. A select on `#EDEDED` ("dla kogo?", 18px, chevron)
2. A postal-code input (13px)
3. A product search input with a green outline magnifier icon

### Hero tiles
Two side-by-side photo tiles (shop vs. gastronomy) separated by a thin dark gutter. A large centered white headline overlaps both tiles. Each tile has a 28px/500 white link with a `›` chevron near the bottom.

### Promo banner
A wide green-gradient banner with white Figtree text and a small red CTA. Treat it as an image or marketing slot, not a reusable component.

### Footer
`#3D4455` background with `#F3F3F5` text. The left column has a heading (18px/600) and a bullet list (16px/200). The right column holds bold links (18px/600). Below them are the contact block and the orange primary CTA.

### Sidebar strip
A 35 px solid `#01983D` strip along the left edge of the page. It is a decorative brand device.

## Logo usage

- Place `assets/logo.svg` top-left in the header at 50 px height on a white background. Keep clear space of at least the height of the ".pl" badge around it.
- Use `assets/logo-eurocash360.svg` only as a companion mark to the right of the main logo, never alone as the primary brand.
- No inverted (white) variant was found. On dark backgrounds, place the logo on a white container instead of recoloring it.
- Do not change the logo colors (`#00813D`, `#005925`, `#EE3042`), and do not stretch or crop it.

## Visual style summary

Eurocash looks practical and B2B-focused: a wholesale and distribution brand for shop owners and restaurateurs. The palette pairs a confident retail green with an energetic orange CTA, grounded by slate-navy neutrals (`#3D4455`, `#2E3441`) instead of pure black. Typography is plain Roboto with strong weight contrast: huge bold white headlines on lifestyle photography, light weights for secondary text. The memorable detail is the asymmetric "leaf" corner (`10px 0`) on buttons, together with the green left-edge strip. Layouts are flat and blocky, with almost no shadows except on the search box.
