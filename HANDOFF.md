# Project handoff: Auto DM Plugin + Plant Store demo

This file holds the full context of the project, so a new chat (or a new person) can pick up from here. Paste the "Start here" section at the bottom into a new chat.

## 1. Summary

A product to pitch to brands that already have an Instagram account and a website:

1. Someone comments a keyword (e.g. `NIMBU`) on a brand's reel.
2. They get an automatic DM with a button.
3. The button opens a page in the **brand's own look** showing the products from **that reel**.
4. Every product, and the big button at the end of the page, opens on the **brand's own website**.

There's no cart, checkout or catalog here; the brand keeps selling on its existing site. One install per client.

The first demo is for **Plant Store** ([plantstore.live](https://plantstore.live), a Shopify store). It's live on the Oracle VM, sharing the Instagram account and Meta webhook with the Mehta Mart store.

It grew out of [Auto_DM](https://github.com/Shashank-Codes-bit/Auto_DM) (branch `claude/affectionate-rubin-it8bkq`), a full store with cart and checkout built for Mehta Mart. The comment → DM code is the same; the store, cart, checkout, orders and customer accounts were left out.

## 2. Key facts

| | |
|---|---|
| Repo | `Shashank-Codes-bit/Auto_DM_Plugin` (**public**), branch `main` |
| Live reel pages | https://plantstore.140-238-251-141.sslip.io/r/finger-lemon and `/r/7-creepers` |
| Reels index | https://plantstore.140-238-251-141.sslip.io/ |
| Admin | https://plantstore.140-238-251-141.sslip.io/login, same phone and password as the Mehta Mart admin (`ADMIN_PHONE` / `ADMIN_PASSWORD` in the VM `.env`) |
| Health check | `/health` returns `ok` |
| Instagram account | `@_shoppingforher_` (business account, IG_USER_ID `17841465186333519`), shared with Mehta Mart |
| Test commenter | `_squenza` (an Instagram tester on the Meta app). Follow `@_shoppingforher_` from it so DMs land in the main inbox, not Message requests |
| Meta webhook | Still points at **Mehta Mart** (`https://mehtamart.140-238-251-141.sslip.io/webhook`, field `comments`). Mehta Mart passes on comments for reels it doesn't use |
| DM link | `https://mehtamart.140-238-251-141.sslip.io/l/<slug>`, which Mehta Mart redirects to this app's `/r/<slug>` |
| Server | Oracle VM `svc-agent`, 140.238.251.141, Arm64, 6 GB RAM, Ubuntu 24.04, shared with other sites |
| App on the VM | `~/plantstore-dm`, Docker Compose project `plantstore`, service `web`, `127.0.0.1:8110`, volume `plantstore_data` at `/data`, secrets in `~/plantstore-dm/deploy/.env` |
| Front door | Caddy, site file added with `add-site.sh plantstore proxy 8110` |
| Mehta Mart on the VM | `~/mehtamart`, port 8100. Its `deploy/.env` has `FORWARD_WEBHOOK_URL` and `PLUGIN_URL` pointing here |

## 3. How it works

```
comment "NIMBU" on the Finger Lemon reel
  → Meta webhook → Mehta Mart /webhook
      Mehta Mart: reel isn't mine (skip:unmapped-reel) → re-posts the delivery unchanged, with Meta's signature
  → Plant Store app /webhook (checks the signature with the same APP_SECRET)
      keyword matches → Private Reply DM with button → https://mehtamart…/l/finger-lemon?src=dm
  → Mehta Mart redirects /l/finger-lemon → https://plantstore…/r/finger-lemon?src=dm   (visit counted)
  → shopper taps a product → /go/<id>?r=finger-lemon   (click counted, UTM tags added)
  → https://plantstore.live/products/finger-lemon-grafted-tree?utm_source=instagram&utm_medium=dm&utm_campaign=finger-lemon&utm_content=product-1
```

- **DMs:** the same logic as Auto_DM. Keywords are whole words and case doesn't matter. Each comment is claimed once, so duplicate deliveries send one DM. The DM uses a button template, falling back to plain text with the link. An optional public reply goes under the comment. Instagram allows one private reply per comment, within 7 days.
- **Rule for sharing the account:** map each reel in one app only. Mehta Mart answers first; only reels it doesn't use are passed on.
- **Product data:** the owner pastes a product link and the server reads the page **once**:
  1. Shopify `/products/<handle>.json`
  2. then JSON-LD `Product`
  3. then Open Graph tags

  The photo is copied (card-sized) into our database. Shoppers only read our copy, so there's no extra latency. Every hour, links not checked in `LINK_REFRESH_HOURS` (24) are re-checked: new prices are applied and flagged, and missing pages are marked broken.
- **Safety:** only public addresses are fetched (no private or local IPs, re-checked on every redirect), with an 8 s timeout and size caps. `/go` only redirects to saved links, so it's never an open redirect. The admin is owner-only, with a signed cookie, CSRF tokens and a login rate limit.

## 4. Features

**Reel page `/r/<slug>`** (phone-first, in the brand's theme):
- A scrolling announcement strip at the top.
- A header with the logo and a "Visit website ↗" button.
- The reel video next to the headline (tap to play, then tap again for sound).
- Product cards: number, photo, name, price, struck-through MRP, % off badge, and "View on website ↗".
- A big end-of-page "Shop all at plantstore.live" block.
- "More from our reels", trust points and a footer.

**Other public routes:**
- `/`: all live reels, link-in-bio style.
- `/l/<slug>`: redirects to `/r/<slug>`.
- `/go/<id>` and `/go/site`: count the tap, add UTM tags and redirect.

**Admin `/admin`:**
- **Dashboard:**
  - a setup checklist
  - totals: DMs, page opens, clicks, click rate
  - a per-reel funnel table
  - most-clicked products
  - alerts for broken links and changed prices
- **Products:**
  - paste one link (a filled-in preview to check, then save) or up to 20 at once (saved straight away)
  - edit, check against the website now, archive, delete
- **Reels:**
  - the account's posts, fetched live
  - per reel: pick and order 1–20 products, plus headline, subtitle, page link, keywords, DM text, button text, public reply, live/paused, preview, and copy DM link
- **DM activity:** every comment received and what happened to it.
- **Brand & settings:**
  - brand name, website, logo and Instagram handle
  - the page words: strip, kicker, button texts, end-of-page text, trust points, footer
  - show prices on or off, UTM tagging on or off
  - the look: 10 colours, heading and body fonts, corner radii, uppercase buttons, and presets (Clean, Plant Store)
  - Instagram connection status, and Load demo data

**Plant Store theme** (preset `plantstore`, matched to their site):
- Colours: background `#F7F4EC`, text `#1D2A20`, primary `#234D33`, badge `#F0E3D0`/`#8A5A1D`, strip `#234D33`.
- Fonts: Playfair Display headings over Inter body text.
- Shapes: 18px card corners, pill buttons, uppercase button text.
- Logo from their CDN.

**Demo data** (`seed/demo.json`): each reel is found by its caption (`match`). Products are read live from plantstore.live, falling back to the saved details if the site can't be reached.

| Reel (caption) | Instagram ID | Page | Keywords | Products |
|---|---|---|---|---|
| Finger Lemon ("Sabse mehenga nimbu") | 18094263785676717 | `/r/finger-lemon` | NIMBU, LEMON, PLANTS, LINK | Finger Lemon, Ultimate Lemon Collection, Gandharaj, Variegated, Red Pati, Sweet Lemon, Kagzi |
| 7 Creepers | 17901817398378052 | `/r/7-creepers` | CREEPER, CREEPERS, PLANTS, LINK | Juhi, Madhu Malti, Allamanda, Japanese Wisteria, Curtain Creeper, Chain of Glory, Sandpaper Vine |

The creeper list and order are a best guess. Check them against the video in Admin → Reels.

Mehta Mart uses the other reels on the account: Trending Toys, Kitchen Creations, Fresh Start Cleaning and All New Bedsheets.

## 5. Code map

| Path | What it is |
|---|---|
| `src/server.js` | Express 5 app, security headers, `/health`, `/webhook` (DM links are `DM_LINK_BASE/l/<slug>`), mounts routes, starts the link checker. `trust proxy` 1 |
| `src/config.js` | Reads `.env` |
| `src/auth.js` | Owner-only login from `.env`, signed cookie (key includes the password), CSRF, rate limit |
| `src/handler.js`, `src/instagram.js` | Comment → DM logic and Graph API calls (unchanged from Auto_DM). `DRY_RUN=1` only logs |
| `src/unfurl.js` | Reads a product page: Shopify JSON → JSON-LD → Open Graph; SSRF-safe fetch; card-sized Shopify images |
| `src/linkService.js` | `previewLink` (read page and copy photo), `checkLink`, hourly background checker |
| `src/themes.js` | Theme keys, presets, font whitelist, CSS variables |
| `src/routes/public.js` | `/`, `/r/<slug>`, `/l/<slug>`, `/go/<id>`, `/media/<id>`, Instagram media link refresh |
| `src/routes/admin.js`, `src/views/admin.js` | Admin panel |
| `src/routes/account.js` | `/login`, `/logout` |
| `src/views/page.js`, `public/page.css`, `public/page.js` | The themed reel page |
| `src/db/index.js`, `src/db/schema.sql` | Postgres (`DATABASE_URL`) or embedded PGlite in `DATA_DIR`. Tables: settings, media, links, reels, reel_links, activity, visits, clicks. Money in paise |
| `src/repos/*` | Data access |
| `scripts/seed.js`, `seed/demo.json` | Demo loader (`pickReels` finds reels by caption) |
| `test/` | `node --test`: 23 tests (handler, unfurl/SSRF/link checks, HTTP flows, demo load) |
| `Dockerfile`, `deploy/compose.yaml`, `deploy/.env.example`, `DEPLOY.md` | Per-client Docker deploy (`CLIENT` and `PORT` in `deploy/.env`) |

Stack: Node 22 (ESM), Express 5, `pg`, `@electric-sql/pglite`, `dotenv`. No frontend framework or build step.

## 6. Decisions made

- **One brand per install.** Each client gets its own Docker project, port, volume and address.
- **Hosted, no code on the brand's site.** "Integration" means connecting their Instagram and pasting their product links.
- **Product details are a snapshot.** They're kept in our database, so the page is fast; prices are re-checked nightly.
- **The demo shares Mehta Mart's Instagram account and webhook.** The webhook URL in Meta doesn't change. DMs show the Mehta Mart URL, which redirects to the plugin.
- **Owner login from `.env` only.** No shopper accounts, no signup.
- **Prices are shown in ₹.**

## 7. Environment variables (`deploy/.env`; values are never committed)

| Key | Meaning |
|---|---|
| `CLIENT`, `PORT` | Docker project name and localhost port (`plantstore`, `8110`) |
| `PUBLIC_BASE_URL` | `https://plantstore.140-238-251-141.sslip.io` |
| `DM_LINK_BASE` | `https://mehtamart.140-238-251-141.sslip.io` (DM buttons use this; it redirects `/l/<slug>` here). Empty = `PUBLIC_BASE_URL` |
| `ADMIN_PHONE`, `ADMIN_PASSWORD` | Owner login (copied from Mehta Mart's `.env`) |
| `SESSION_SECRET` | Long random string |
| `IG_ACCESS_TOKEN`, `IG_USER_ID`, `APP_SECRET`, `VERIFY_TOKEN` | Same as Mehta Mart. The token expires 60 days after it was created; update both apps when it's renewed |
| `GRAPH_VERSION` | `v23.0` |
| `DRY_RUN` | `0` live, `1` = log DMs only |
| `ONE_DM_PER_USER` | `0` |
| `LINK_REFRESH_HOURS` | `24` (0 = never re-check) |
| `DATABASE_URL` | Empty = built-in database in the volume |

In **Mehta Mart's** `~/mehtamart/deploy/.env`:
- `FORWARD_WEBHOOK_URL=https://plantstore.140-238-251-141.sslip.io/webhook`
- `PLUGIN_URL=https://plantstore.140-238-251-141.sslip.io`

## 8. Operations runbook (Oracle VM)

**SSH** from Windows (disconnect the Voltas VPN first; if port 22 times out, use a phone hotspot or Oracle Cloud Shell):
```powershell
ssh -i "$env:USERPROFILE\.ssh\oracle-svc-agent.key" ubuntu@140.238.251.141
```

**Deploy an update:**
```bash
cd ~/plantstore-dm && git pull && cd deploy && docker compose up -d --build
curl -s -o /dev/null -w "%{http_code}\n" 127.0.0.1:8110/health   # 200 (000 right after a restart is normal; retry)
```

**Logs and restart:**
```bash
cd ~/plantstore-dm/deploy
docker compose logs web --tail 30
docker compose restart web
```

**Reload the demo data** (stops the app for a few seconds; PGlite allows one process at a time):
```bash
cd ~/plantstore-dm/deploy
docker compose stop web && docker compose run --rm -T web npm run seed && docker compose start web
```

**Backup:**
```bash
cd ~/plantstore-dm/deploy && docker compose stop web
docker run --rm -v plantstore_data:/data -v ~/backups:/backup busybox tar czf /backup/plantstore-$(date +%F).tgz -C /data .
docker compose start web
```

**Change the admin password:** edit `ADMIN_PASSWORD` in `~/plantstore-dm/deploy/.env`, then `docker compose up -d`. This logs everyone out.

**Check that comment forwarding works:** Mehta Mart's log shows `Passed comment on to https://plantstore…/webhook: 200`, and the plugin's log shows `comment <id> on <reel>: sent`.

**Rules on this shared VM:**
- Only touch the `plantstore` and `mehtamart` projects.
- Never stop or restart other projects' containers, never edit other Caddy site files, never publish on `0.0.0.0` or open new ports.
- Never `docker compose down -v` (it deletes the data) and never `docker system prune -a`.
- Secrets live only in `.env` on the VM, never in git or chat.

**Port register:** 8100 → `mehtamart`, 8110 → `plantstore`. Other sites: service bot on 8080, alerts on 8000.

**Local development:**
```bash
npm install
cp .env.example .env    # DRY_RUN=1, owner login, optional Instagram keys
npm start               # port 3000
npm test
```
Instagram can't deliver webhooks to localhost, so live DMs need the VM.

## 9. Timeline

- **2026-10-14:**
  - Planned the plugin: link-out instead of cart, hosted, one install per client.
  - Read plantstore.live (Shopify, open product JSON) and matched their theme.
  - Built the plugin: 23 tests, local run with live product data.
  - Auto_DM got `FORWARD_WEBHOOK_URL` and `PLUGIN_URL` (commit `323b0dc`).
- **2026-10-15:**
  - The demo was re-mapped to the two real Plant Store reels (Finger Lemon, 7 Creepers), found by caption.
  - Deployed to the VM: Caddy site, demo loaded, Mehta Mart updated and restarted.
  - Verified the DM link redirect, the reel page, product click-out with UTMs, and a signed test comment passed from Mehta Mart to the plugin.
  - **Still to do:** a real comment from `_squenza`.

## 10. Known gaps and next steps

- **Real end-to-end test:** comment `NIMBU` / `CREEPERS` from `_squenza` and confirm the DM arrives.
- **Token refresh:** both apps share one long-lived token (60 days). Add automatic refresh (`GET /refresh_access_token`) in one app and copy the token to the other, or set a calendar reminder.
- **Meta App Review** (Advanced Access) so everyone, not just testers, gets DMs. Until then, add the client's own Instagram account as a tester if they want to try it.
- **Per-client deploy for a paying client:** their own Instagram account and Meta webhook, their own domain (DNS A record → `add-site.sh … --host`), `DM_LINK_BASE` empty.
- **Currencies:** add a currency setting for non-INR brands.
- **Embed script** so reel pages can also live inside the brand's own site.
- **Theme from URL:** read colours and fonts from the brand's homepage automatically.
- **Test data:** the dashboard has one test click and DM activity has one test comment (`forward-check-1`) from the go-live checks.

## Start here (paste into a new chat)

> I'm continuing a project. Repo `Shashank-Codes-bit/Auto_DM_Plugin`, branch `main`. Read `HANDOFF.md`, `README.md` and `DEPLOY.md` first. It's an Instagram comment → DM → themed reel page → brand's own website product, built as a per-client plugin. The first demo is Plant Store (plantstore.live), live on my Oracle VM at https://plantstore.140-238-251-141.sslip.io (Docker project `plantstore`, port 8110, Caddy in front, PGlite in a Docker volume). It shares the Instagram account and Meta webhook with the Mehta Mart store (repo `Shashank-Codes-bit/Auto_DM`, branch `claude/affectionate-rubin-it8bkq`, `~/mehtamart`, port 8100), which forwards comments for reels it doesn't use. Run `npm test` before pushing, and never put secrets in git or chat. I update the VM with: `cd ~/plantstore-dm && git pull && cd deploy && docker compose up -d --build`. Next I want to: <your next task>.
