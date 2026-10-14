import { discountPercent, formatMoney, hostLabel } from '../util.js';
import { fontHref, themeCss } from '../themes.js';
import { asset } from './assets.js';
import { html, raw } from './html.js';

// Public pages shoppers see: the reel page a DM opens, the reels index, and "not found".
// Every product and "visit website" link goes through /go/… so taps are counted and tagged.

const goSite = (slug) => `/go/site${slug ? `?r=${encodeURIComponent(slug)}` : ''}`;
const goLink = (id, slug) => `/go/${id}${slug ? `?r=${encodeURIComponent(slug)}` : ''}`;
const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);

function layout({ settings: s, title, description = '', image = '', body, owner = false, editHref = '' }) {
  const fonts = fontHref(s.font_heading, s.font_body);
  const strip = lines(s.announcement);
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
${description ? html`<meta name="description" content="${description}">` : ''}
<meta property="og:title" content="${title}">
${image ? html`<meta property="og:image" content="${image}">` : ''}
<meta name="theme-color" content="${s.color_bg}">
${s.logo_url ? html`<link rel="icon" href="${s.logo_url}">` : html`<link rel="icon" href="data:,">`}
${fonts ? html`<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${fonts}">` : ''}
<style>${raw(themeCss(s))}</style>
<link rel="stylesheet" href="${asset('page.css')}">
</head>
<body>
${owner ? html`<div class="owner-bar"><span>Owner view</span><a href="/admin">Admin</a>${editHref ? html`<a class="owner-edit" href="${editHref}">Edit this page</a>` : ''}</div>` : ''}
${strip.length ? html`<div class="strip" aria-label="Highlights"><div class="strip-track">${[...strip, ...strip].map((x, i) => html`<span ${i >= strip.length ? raw('aria-hidden="true"') : ''}>${x}</span>`)}</div></div>` : ''}
${body}
<script src="${asset('page.js')}" defer></script>
</body>
</html>`;
}

function header(s, slug) {
  return html`<header class="top">
  <div class="top-inner">
    <a class="brand" href="${s.website_url ? goSite(slug) : '/'}">
      ${s.logo_url ? html`<img src="${s.logo_url}" alt="${s.brand_name}">` : html`<span class="brand-name">${s.brand_name}</span>`}
    </a>
    ${s.website_url ? html`<a class="btn btn-outline btn-small" href="${goSite(slug)}">Visit website <span aria-hidden="true">↗</span></a>` : ''}
  </div>
</header>`;
}

function card(link, i, s, slug) {
  const off = discountPercent(link.price_paise, link.mrp_paise);
  const badge = link.badge || (off ? `-${off}%` : '');
  const showPrice = s.show_prices === '1' && link.price_paise != null;
  return html`<li>
  <a class="card" href="${goLink(link.id, slug)}" rel="nofollow">
    <span class="card-img">
      ${link.image_url ? html`<img src="${link.image_url}" alt="" loading="${i < 4 ? 'eager' : 'lazy'}" decoding="async">` : html`<span class="card-img-empty" aria-hidden="true"></span>`}
      <span class="card-num" aria-hidden="true">${i + 1}</span>
    </span>
    <span class="card-body">
      <span class="card-title">${link.title}</span>
      ${showPrice ? html`<span class="card-price">
        <strong>${formatMoney(link.price_paise)}</strong>
        ${link.mrp_paise ? html`<s>${formatMoney(link.mrp_paise)}</s>` : ''}
        ${badge ? html`<span class="badge">${badge}</span>` : ''}
      </span>` : badge ? html`<span class="card-price"><span class="badge">${badge}</span></span>` : ''}
      <span class="btn btn-outline btn-block">${s.card_button} <span aria-hidden="true">↗</span></span>
    </span>
  </a>
</li>`;
}

function ctaBlock(s, slug) {
  if (!s.website_url) return '';
  return html`<section class="cta" aria-labelledby="cta-title">
  <h2 id="cta-title">${s.cta_title}</h2>
  ${s.cta_text ? html`<p>${s.cta_text}</p>` : ''}
  <a class="btn btn-primary btn-large" href="${goSite(slug)}">${s.cta_button} <span aria-hidden="true">↗</span></a>
  <small>${hostLabel(s.website_url)}</small>
</section>`;
}

function reelStrip(reels, title) {
  if (!reels.length) return '';
  return html`<section class="more" aria-labelledby="more-title">
  <h2 id="more-title">${title}</h2>
  <ul class="more-list">
    ${reels.map((r) => html`<li><a href="/r/${r.slug}">
      ${r.thumbnail_url ? html`<img src="${r.thumbnail_url}" alt="" loading="lazy">` : html`<span class="more-empty"></span>`}
      <span>${r.headline || r.slug}<small>${r.link_count} picks</small></span>
    </a></li>`)}
  </ul>
</section>`;
}

function footer(s) {
  const trust = lines(s.trust_points).slice(0, 4);
  return html`${trust.length ? html`<ul class="trust">${trust.map((t) => html`<li>${t}</li>`)}</ul>` : ''}
<footer class="foot">
  <p>${s.footer_text || s.brand_name}</p>
  ${s.instagram_handle ? html`<p><a href="https://instagram.com/${s.instagram_handle}" rel="noopener">@${s.instagram_handle} on Instagram</a></p>` : ''}
</footer>`;
}

export function reelPage({ settings: s, reel, moreReels = [], owner = false }) {
  const n = reel.links.length;
  const poster = reel.thumbnail_url;
  return layout({
    settings: s,
    title: `${reel.headline || 'Shop the reel'} | ${s.brand_name}`,
    description: reel.subtitle || `${n} picks from our reel`,
    image: reel.links[0]?.image_url?.startsWith('http') ? reel.links[0].image_url : poster,
    owner,
    editHref: `/admin/reels/${reel.ig_media_id}`,
    body: html`${header(s, reel.slug)}
<main class="wrap">
  <section class="hero">
    <div class="hero-media" ${reel.video_url ? raw('data-video') : ''}>
      ${reel.video_url
        ? html`<video src="${reel.video_url}" poster="${poster}" muted playsinline loop preload="metadata" aria-label="The reel"></video>
          <button type="button" class="play" aria-label="Play the reel"><span aria-hidden="true">▶</span></button>`
        : poster ? html`<img src="${poster}" alt="The reel">` : html`<span class="hero-empty"></span>`}
      ${reel.permalink ? html`<a class="hero-ig" href="${reel.permalink}" rel="noopener">Watch the reel</a>` : ''}
    </div>
    <div class="hero-copy">
      ${s.page_kicker ? html`<p class="kicker">${s.page_kicker}</p>` : ''}
      <h1>${reel.headline || 'Shop the reel'}</h1>
      <p class="sub">${reel.subtitle || `${n} ${n === 1 ? 'pick' : 'picks'} from this reel, in the order they appear.`}</p>
      ${n ? html`<a class="btn btn-primary" href="#picks">See the ${n === 1 ? 'product' : `${n} products`}</a>` : ''}
    </div>
  </section>

  ${n ? html`<ol class="grid" id="picks">${reel.links.map((l, i) => card(l, i, s, reel.slug))}</ol>`
    : html`<p class="empty">The products from this reel are being updated. Visit our website to shop everything.</p>`}

  ${ctaBlock(s, reel.slug)}
  ${reelStrip(moreReels, 'More from our reels')}
  ${footer(s)}
</main>`,
  });
}

export function indexPage({ settings: s, reels, owner = false }) {
  return layout({
    settings: s,
    title: `Shop our reels | ${s.brand_name}`,
    owner,
    body: html`${header(s, '')}
<main class="wrap">
  <section class="index-head">
    <p class="kicker">${s.brand_name}</p>
    <h1>Shop our reels</h1>
    <p class="sub">Everything from our Instagram reels, one tap away.</p>
  </section>
  ${reels.length ? html`<ul class="reel-grid">${reels.map((r) => html`<li><a href="/r/${r.slug}">
    ${r.thumbnail_url ? html`<img src="${r.thumbnail_url}" alt="" loading="lazy">` : html`<span class="more-empty"></span>`}
    <span class="reel-grid-copy"><strong>${r.headline || r.slug}</strong><small>${r.link_count} picks</small></span>
  </a></li>`)}</ul>` : html`<p class="empty">No reels here yet.</p>`}
  ${ctaBlock(s, '')}
  ${footer(s)}
</main>`,
  });
}

export function notFoundPage({ settings: s, message }) {
  return layout({
    settings: s,
    title: `Not found | ${s.brand_name}`,
    body: html`${header(s, '')}
<main class="wrap">
  <section class="index-head">
    <h1>Nothing here</h1>
    <p class="sub">${message}</p>
  </section>
  ${ctaBlock(s, '')}
</main>`,
  });
}
