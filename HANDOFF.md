# Project handoff: Auto DM Plugin

Picking this up in a new chat? Read this, then `README.md` and `DEPLOY.md`.

## What it is

A product to pitch to brands that already have an Instagram account and a website. Comment a keyword on a reel → DM with a button → a reel page in the brand's look → every product opens on the brand's website. One install per client.

It grew out of [Auto_DM](https://github.com/Shashank-Codes-bit/Auto_DM) (branch `claude/affectionate-rubin-it8bkq`), a full store with cart and checkout built for Mehta Mart. The comment → DM code is the same; the store, cart, checkout, orders and customer accounts were left out.

## First demo: Plant Store

- [plantstore.live](https://plantstore.live) is a Shopify store, so products fill in exactly from `/products/<handle>.json`.
- Their look: background `#F7F4EC`, text `#1D2A20`, primary `#234D33`, Playfair Display headings over Inter, pill buttons, 18px card corners, a green announcement strip. This is the `plantstore` preset in `src/themes.js`.
- `seed/demo.json`: brand settings and 14 products on 2 reel pages, matched to the Plant Store reels posted on the test account: `finger-lemon` (caption “Finger Lemon”, keywords `NIMBU`, `LEMON`, `PLANTS`, `LINK`) and `7-creepers` (caption “7 Creepers”, keywords `CREEPER`, `CREEPERS`, `PLANTS`, `LINK`). Reels are found by caption. Product order is a best guess; reorder in Admin → Reels to match the video.
- It runs on the same Instagram account and Meta app as the Mehta Mart store. Meta's webhook still points at Mehta Mart, which passes on comments on reels it doesn't use (`FORWARD_WEBHOOK_URL`) and redirects `/l/<slug>` to this app (`PLUGIN_URL`). This app's `DM_LINK_BASE` is the Mehta Mart address, so DMs show the Mehta Mart URL.

## Code map

| Path | What it is |
|---|---|
| `src/server.js` | Express app, `/health`, `/webhook` (DM links are `DM_LINK_BASE/l/<slug>`), mounts routes, starts the link checker |
| `src/handler.js`, `src/instagram.js` | Comment → DM logic and Graph API calls, unchanged from Auto_DM |
| `src/unfurl.js` | Reads a product page: Shopify JSON → JSON-LD → Open Graph. SSRF-safe fetch with timeouts and size caps |
| `src/linkService.js` | `previewLink` (read page + copy photo), `checkLink` and the hourly background re-check |
| `src/themes.js` | Theme keys, presets, font list, CSS variables |
| `src/routes/public.js` | `/`, `/r/<slug>`, `/l/<slug>`, `/go/<id>` (click count + UTM), `/media/<id>` |
| `src/routes/admin.js`, `src/views/admin.js` | Admin panel: dashboard, products, reels, activity, brand & settings, demo data |
| `src/views/page.js`, `public/page.css`, `public/page.js` | The themed reel page |
| `src/repos/*` | links, reels (`reel_links`), clicks, visits, activity, settings, media, stats |
| `scripts/seed.js`, `seed/demo.json` | Demo loader |
| `test/` | `node --test`: handler, unfurl/SSRF/link checks, HTTP flows |

## Known gaps and next steps

- **Token refresh:** the long-lived Instagram token expires after 60 days. Both apps share one token for the demo; add an automatic refresh in one of them.
- **Meta App Review** so everyone, not only testers, gets DMs.
- **Currencies:** prices are shown in ₹. Non-INR brands need a currency setting.
- **Embed script** so reel pages can also live inside the brand's own site.
- **Theme from URL:** read colours and fonts from the brand's homepage automatically.
