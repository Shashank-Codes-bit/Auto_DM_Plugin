# Auto DM Plugin: Instagram comment → DM → your website

Someone comments a keyword on a brand's reel. They get a DM with a button. The button opens a page in the brand's own look that shows the products from **that reel**. Every product, and the big button at the end of the page, opens the product on the **brand's own website**.

There's no cart, checkout or catalog here. The brand keeps selling on the website it already has; this plugs Instagram into it.

```
comment "BULBS" on a reel ──▶ webhook ──▶ DM with "See the bulbs" button
                                                │
                                                ▼
                         /r/<reel>  reel + its 1–20 products, in the brand's theme
                                                │  tap a product / "Shop all"
                                                ▼
                         /go/…  (counted, tagged utm_source=instagram) ──▶ brand's website
```

It uses Instagram's official APIs: comment **webhooks**, plus **Private Replies**, which DM the person who wrote a comment (one per comment, within 7 days).

## What the brand gets

| Part | Where | What it does |
|---|---|---|
| Reel page | `/r/<slug>` | The reel, a headline, then the products as cards (photo, price, MRP, % off, “View on website ↗”). The end of the page has a big “Shop all at brand.com” button and more reels. Phone-first. |
| Reels index | `/` | All live reels, like a link-in-bio page |
| DM link | `/l/<slug>` | The link inside DMs; redirects to the reel page |
| Click-out | `/go/<id>`, `/go/site` | Counts the tap, adds UTM tags and opens the brand's page |
| Admin | `/admin` | Owner only, see below |
| Webhook | `/webhook` | Receives Instagram comments and sends the DM |

**Admin panel:**
- **Dashboard:** a setup checklist, then the funnel: DMs sent → reel page opens → clicks to the website, with click rate, per reel. Most-clicked products. Alerts for products whose page is gone or whose price changed.
- **Products:** paste product links from the brand's website (one, or up to 20 at once). The name, photo and price fill themselves in; the owner checks and saves. Every product can be edited by hand.
- **Reels:** the brand's Instagram posts, fetched live. For each reel, pick 1–20 products in order, plus keywords, DM text, button text, an optional public reply, and live or paused.
- **DM activity:** every comment received and what happened to it.
- **Brand & settings:** name, website, logo, the words on the page (top strip, button text, end-of-page text, trust points), and the look: 10 colours, heading and body fonts, corner radius, button style, with ready-made presets.

## How "paste a link" works

When the owner pastes a link, the server reads that page **once** and keeps a copy:
1. Shopify stores: `/products/<handle>.json` gives the exact price, MRP and photos.
2. Any other site: the page's JSON-LD `Product` data, then its Open Graph tags (the same data Google and WhatsApp previews use).
3. The photo is copied into our database (card-sized), so the reel page never depends on the brand's image server.

Shoppers only ever read our copy, so the page is as fast as any static page. Every hour, a background job re-checks links that weren't checked for `LINK_REFRESH_HOURS` (default 24): prices are updated and flagged, and pages that are gone are marked so the owner sees them. Only public addresses are fetched (no private or local IPs), with timeouts and size limits.

## Run it

Requirements: Node.js 20+, and an Instagram **Business or Creator** account connected to a Meta app with **Instagram login** (`instagram_business_basic`, `instagram_business_manage_comments`, `instagram_business_manage_messages`).

```bash
npm install
cp .env.example .env     # fill in the Instagram keys, ADMIN_PHONE / ADMIN_PASSWORD, SESSION_SECRET, PUBLIC_BASE_URL
npm start                # http://localhost:3000
```

Then in the Meta app, Instagram → API setup with Instagram login → **Configure webhooks**: callback `PUBLIC_BASE_URL/webhook`, your `VERIFY_TOKEN`, subscribe to **comments**.

Log in on `/login`. The dashboard checklist walks through the rest: brand and look, products, the first reel.

While the Meta app hasn't passed App Review, only accounts with a role on the app (e.g. **Instagram tester**) trigger webhooks and get DMs.

## Sharing an Instagram account with another app

Meta allows one webhook URL per app. If another app already receives the account's comments (for example the Auto_DM store), that app can pass on the comments it doesn't handle, unchanged, to this one's `/webhook`. The body and Meta's signature are kept, so this app checks them with the same `APP_SECRET`. Set `DM_LINK_BASE` to that app's address so DM buttons use it; it redirects `/l/<slug>` here. Map each reel in one app only.

## Demo data (Plant Store)

`seed/demo.json` holds a demo for [plantstore.live](https://plantstore.live): the brand, a theme matched to their site (cream, forest green, Playfair Display and Inter, pill buttons) and 14 real products on 2 reel pages: `finger-lemon` (the “Sabse mehenga nimbu” reel) and `7-creepers`. Each demo reel is found by its caption (`match`), so it never lands on another app's reel. Load it from **Admin → Brand & settings → Load demo data**, or with `npm run seed` while the server is stopped (`-- <id> <id>` to pick reels, `-- --offline` to skip reading the website).

## Tests

```bash
npm test
```

## Hosting

One install per client. [DEPLOY.md](DEPLOY.md) has the Docker recipe. Any Node host with HTTPS works; use a hosted Postgres in `DATABASE_URL` if the host's disk isn't permanent.
