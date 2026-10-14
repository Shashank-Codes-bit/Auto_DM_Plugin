import { discountPercent, formatMoney, hostLabel, paiseToInput } from '../util.js';
import { MAX_REEL_LINKS } from '../repos/reels.js';
import { FONTS, PRESETS } from '../themes.js';
import { asset } from './assets.js';
import { html, raw } from './html.js';

const FONT_URL =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&display=swap';

const NAV = [
  ['dashboard', '/admin', 'Dashboard'],
  ['links', '/admin/links', 'Products'],
  ['reels', '/admin/reels', 'Reels'],
  ['activity', '/admin/activity', 'DM activity'],
  ['settings', '/admin/settings', 'Brand & settings'],
];

const fmtDate = (d) =>
  new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

const thumb = (src, alt = '') =>
  src ? html`<img class="thumb" src="${src}" alt="${alt}" loading="lazy">` : html`<span class="thumb thumb-empty" aria-hidden="true"></span>`;

const csrfField = (csrf) => html`<input type="hidden" name="_csrf" value="${csrf}">`;
const pct = (num, den) => (den ? `${Math.round((num / den) * 100)}%` : '–');

function priceLine(l) {
  if (l.price_paise == null) return 'No price';
  const off = discountPercent(l.price_paise, l.mrp_paise);
  return `${formatMoney(l.price_paise)}${l.mrp_paise ? ` (MRP ${formatMoney(l.mrp_paise)}${off ? `, ${off}% off` : ''})` : ''}`;
}

function linkStatus(l) {
  if (!l.active) return html`<span class="chip chip-off">Archived</span>`;
  if (l.fetch_status === 'broken') return html`<span class="chip chip-cancelled" title="${l.fetch_error}">Page not found</span>`;
  if (l.price_changed) return html`<span class="chip chip-new">Price changed</span>`;
  if (l.fetch_status === 'manual') return html`<span class="chip chip-off">Typed in</span>`;
  return html`<span class="chip chip-live">In sync</span>`;
}

export function adminLayout({ title, active, body, csrf, flash, badges = {} }) {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="icon" href="data:,">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} | Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONT_URL}">
<link rel="stylesheet" href="${asset('admin.css')}">
</head>
<body data-csrf="${csrf || ''}">
<div class="shell">
  <nav class="side" aria-label="Admin">
    <a class="side-brand" href="/admin">Reel DM admin</a>
    <ul>
      ${NAV.map(([key, href, label]) => html`<li><a href="${href}" ${key === active ? raw('aria-current="page"') : ''}>${label}${badges[key] ? html`<span class="badge">${badges[key]}</span>` : ''}</a></li>`)}
    </ul>
    <div class="side-foot">
      <a href="/">View reel pages</a>
      <form method="post" action="/logout">${csrfField(csrf)}<button type="submit" class="linkish">Log out</button></form>
    </div>
  </nav>
  <main class="content">
    ${flash?.ok ? html`<p class="flash ok" role="status">${flash.ok}</p>` : ''}
    ${flash?.error ? html`<p class="flash err" role="alert">${flash.error}</p>` : ''}
    ${body}
  </main>
</div>
<script src="${asset('admin.js')}" defer></script>
</body>
</html>`;
}

export function loginPage({ error = '', next = '/admin', phone = '', brand = '' }) {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Log in | Admin</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="${FONT_URL}">
<link rel="stylesheet" href="${asset('admin.css')}">
</head>
<body class="login-body">
<form class="login" method="post" action="/login">
  <h1>${brand ? `${brand} admin` : 'Admin'}</h1>
  <input type="hidden" name="next" value="${next}">
  <label>Mobile number<input name="phone" type="tel" inputmode="numeric" autocomplete="username" required value="${phone}"></label>
  <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
  ${error ? html`<p class="flash err" role="alert">${error}</p>` : ''}
  <button class="btn primary" type="submit">Log in</button>
</form>
</body>
</html>`;
}

// ---------------------------------------------------------------- dashboard
function setupChecklist(checklist, csrf) {
  if (!checklist || checklist.dismissed) return '';
  const done = checklist.steps.filter((x) => x.done).length;
  if (done === checklist.steps.length) return '';
  return html`<section class="panel checklist" aria-labelledby="setup-title">
  <div class="panel-head">
    <div><h2 id="setup-title">Get set up</h2><p class="hint" style="margin:4px 0 0">${done} of ${checklist.steps.length} done. Steps tick themselves off as you go.</p></div>
    <form method="post" action="/admin/checklist/dismiss">${csrfField(csrf)}<button class="linkish dark" type="submit">Hide this</button></form>
  </div>
  <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${checklist.steps.length}" aria-valuenow="${done}"><span style="width:${Math.round((done / checklist.steps.length) * 100)}%"></span></div>
  <ol class="steps-list">
    ${checklist.steps.map((x) => html`<li class="${x.done ? 'done' : ''}">
      <span class="tick" aria-hidden="true">${x.done ? '✓' : ''}</span>
      <div><strong>${x.title}</strong><p>${x.text}</p></div>
      ${x.done ? html`<span class="chip chip-live">Done</span>` : html`<a class="btn ${x === checklist.steps.find((y) => !y.done) ? 'primary' : ''}" href="${x.href}">${x.action}</a>`}
    </li>`)}
  </ol>
</section>`;
}

export function dashboardPage({ stats, reels, topLinks, activity, warnings, checklist, csrf }) {
  const tiles = [
    ['DMs sent', stats.dms, `${stats.dms_today} today`],
    ['Reel page opens', stats.visits, `${stats.visits_today} today`],
    ['Clicks to your website', stats.clicks, `${stats.clicks_today} today`],
    ['Click rate', pct(stats.clicks, stats.visits), 'Clicks per page open'],
  ];
  return html`
<header class="page-head"><h1>Dashboard</h1><a class="btn" href="/">View reel pages</a></header>
${warnings.map((w) => html`<p class="flash warn">${w}</p>`)}
${setupChecklist(checklist, csrf)}
<section class="tiles">
  ${tiles.map(([label, value, sub]) => html`<div class="tile"><p class="tile-label">${label}</p><p class="tile-value">${value}</p><p class="tile-sub">${sub}</p></div>`)}
</section>

${stats.broken || stats.price_changed ? html`
<section class="panel attention">
  <h2>Needs you</h2>
  <ul>
    ${stats.broken ? html`<li><a href="/admin/links?status=attention">${stats.broken} product page${stats.broken > 1 ? 's' : ''} no longer found on your website</a></li>` : ''}
    ${stats.price_changed ? html`<li><a href="/admin/links?status=attention">${stats.price_changed} price${stats.price_changed > 1 ? 's' : ''} changed on your website (already updated here, open to confirm)</a></li>` : ''}
  </ul>
</section>` : ''}

<section class="panel">
  <div class="panel-head"><h2>Reels</h2><a href="/admin/reels">Manage reels</a></div>
  ${reels.length ? html`
  <div class="table-wrap"><table>
    <thead><tr><th>Reel</th><th class="num">Products</th><th class="num">DMs sent</th><th class="num">Page opens</th><th class="num">Clicks</th><th class="num">Click rate</th><th>Status</th></tr></thead>
    <tbody>${reels.map((r) => html`<tr>
      <td><a class="row-link" href="/admin/reels/${r.ig_media_id}">${thumb(r.thumbnail_url)}<span>${r.headline || r.slug}</span></a></td>
      <td class="num">${r.link_count}</td><td class="num">${r.dm_count}</td><td class="num">${r.visit_count}</td><td class="num">${r.click_count}</td>
      <td class="num">${pct(r.click_count, r.visit_count)}</td>
      <td>${r.active ? html`<span class="chip chip-live">Live</span>` : html`<span class="chip chip-off">Paused</span>`}</td>
    </tr>`)}</tbody>
  </table></div>` : html`<p class="empty">No reels set up yet. <a href="/admin/reels">Set up your first reel</a>.</p>`}
</section>

<div class="two-col">
  <section class="panel">
    <div class="panel-head"><h2>Most clicked products</h2><a href="/admin/links">All products</a></div>
    ${topLinks.length ? html`<ul class="feed">${topLinks.map((l) => html`<li><a class="row-link" href="/admin/links/${l.id}">${thumb(l.image_url)}<span>${l.title}</span></a><span>${l.clicks} clicks</span></li>`)}</ul>` : html`<p class="empty">No clicks yet.</p>`}
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Latest comments</h2><a href="/admin/activity">All activity</a></div>
    ${activity.length ? html`<ul class="feed">${activity.map((a) => html`<li><span><strong>@${a.username || '?'}</strong> “${a.text}”</span>${resultChip(a.result)}</li>`)}</ul>` : html`<p class="empty">No comments processed yet.</p>`}
  </section>
</div>`;
}

// ---------------------------------------------------------------- products (links)
export function linksPage({ links, search, status, csrf, websiteUrl }) {
  const tabs = [['all', 'All'], ['active', 'Live'], ['attention', 'Needs attention'], ['archived', 'Archived']];
  return html`
<header class="page-head"><h1>Products</h1><a class="btn" href="/admin/links/new">Type one in</a></header>
<p class="lead">Each product is a link to its page on your website. Paste the link and we fill in the name, photo and price, then keep the price in sync every night.</p>

<section class="panel">
  <h2>Add products</h2>
  <form method="post" action="/admin/links/add" class="form-grid" data-busy="Reading your website…">
    ${csrfField(csrf)}
    <label>Product links <span class="hint">One per line, up to 20 at a time. One link opens a preview to check before saving.</span>
      <textarea name="urls" rows="3" required placeholder="${websiteUrl ? `${websiteUrl.replace(/\/$/, '')}/products/…` : 'https://yourwebsite.com/products/…'}"></textarea>
    </label>
    <div class="form-actions"><button class="btn primary" type="submit">Fill in from website</button></div>
  </form>
</section>

<form class="filters" method="get">
  <nav class="tabs" aria-label="Filter">${tabs.map(([k, label]) => html`<a href="?status=${k}${search ? `&search=${encodeURIComponent(search)}` : ''}" ${status === k ? raw('aria-current="true"') : ''}>${label}</a>`)}</nav>
  <input type="hidden" name="status" value="${status}">
  <input type="search" name="search" value="${search}" placeholder="Search products" aria-label="Search products">
</form>
${links.length ? html`
<div class="table-wrap"><table>
  <thead><tr><th>Product</th><th>Price</th><th class="num">Reels</th><th class="num">Clicks</th><th>Status</th></tr></thead>
  <tbody>${links.map((l) => html`<tr>
    <td><a class="row-link" href="/admin/links/${l.id}">${thumb(l.image_url)}<span>${l.title}<small>${hostLabel(l.url)}</small></span></a></td>
    <td>${priceLine(l)}</td>
    <td class="num">${l.reel_count}</td><td class="num">${l.click_count}</td>
    <td>${linkStatus(l)}</td>
  </tr>`)}</tbody>
</table></div>` : html`<p class="empty">${search || status !== 'all' ? 'No products match.' : 'No products yet. Paste a product link above to add your first one.'}</p>`}`;
}

export const linkValues = (l) =>
  l
    ? { url: l.url, title: l.title, image_url: l.image_url, price: paiseToInput(l.price_paise), mrp: paiseToInput(l.mrp_paise), badge: l.badge, active: l.active }
    : { url: '', title: '', image_url: '', price: '', mrp: '', badge: '', active: true };

/** Add or edit one product. `fetched` = the values were just read from the website (shown as a preview). */
export function linkFormPage({ link, values: v, csrf, fetched = false, fetchError = '' }) {
  const action = link ? `/admin/links/${link.id}` : '/admin/links';
  return html`
<header class="page-head">
  <div><a class="back" href="/admin/links">Products</a><h1>${link ? 'Edit product' : fetched ? 'Check and save' : 'Add a product'}</h1></div>
  ${v.url ? html`<div class="head-actions"><a class="btn" href="${v.url}" target="_blank" rel="noopener">Open on website ↗</a></div>` : ''}
</header>
${fetched ? html`<p class="flash ok" role="status">Filled in from your website. Check the details, then save.</p>` : ''}
${fetchError ? html`<p class="flash warn">Couldn’t read that page: ${fetchError} Fill in the details yourself.</p>` : ''}
${link?.fetch_status === 'broken' ? html`<p class="flash warn">This page wasn’t found on your website the last time we checked (${link.fetch_error}). It’s still shown on reel pages until you archive it.</p>` : ''}
${link?.price_changed ? html`<p class="flash warn">The price changed on your website and was updated here. Save to confirm.</p>` : ''}

<div class="reel-editor">
  <aside class="reel-preview link-preview">
    ${v.image_url ? html`<img src="${v.image_url}" alt="" data-image-preview>` : html`<span class="reel-card-empty" data-image-preview-empty></span>`}
    <p class="caption"><strong>${v.title || 'Product name'}</strong></p>
    ${link ? html`<p class="hint">Last checked: ${link.fetched_at ? fmtDate(link.fetched_at) : 'never'} · ${link.click_count ?? 0} clicks</p>` : ''}
  </aside>
  <form class="form-grid" method="post" action="${action}">
    ${csrfField(csrf)}
    <input type="hidden" name="fetched" value="${fetched ? '1' : ''}">
    <section class="panel">
      <label>Link on your website<input type="url" name="url" value="${v.url}" required placeholder="https://"></label>
      <label>Product name<input name="title" value="${v.title}" required maxlength="200"></label>
      <label>Photo link <span class="hint">Filled in from the page. You can paste another image link.</span><input name="image_url" value="${v.image_url}" data-image-field></label>
      <div class="row2">
        <label>Price (₹) <span class="hint">Leave empty to hide</span><input name="price" value="${v.price}" inputmode="decimal"></label>
        <label>MRP (₹) <span class="hint">Optional, shown struck through</span><input name="mrp" value="${v.mrp}" inputmode="decimal"></label>
      </div>
      <label class="narrow">Badge <span class="hint">Optional, e.g. “Bestseller”. Default: % off</span><input name="badge" value="${v.badge}" maxlength="24"></label>
      <label class="check"><input type="checkbox" name="active" ${v.active ? raw('checked') : ''}> Show on reel pages</label>
    </section>
    <div class="form-actions">
      <button class="btn primary" type="submit">${link ? 'Save product' : 'Add product'}</button>
      <a class="btn" href="/admin/links">Cancel</a>
    </div>
  </form>
</div>
${link ? html`
<div class="danger-zone row-actions">
  <form method="post" action="/admin/links/${link.id}/check" data-busy="Checking…">${csrfField(csrf)}<button class="btn" type="submit">Check website now</button></form>
  <form method="post" action="/admin/links/${link.id}/delete" data-confirm="Delete this product? It’s removed from every reel that shows it.">
    ${csrfField(csrf)}<button class="btn danger" type="submit">Delete product</button>
  </form>
</div>` : ''}`;
}

// ---------------------------------------------------------------- reels
export function reelsPage({ posts, postsError, reels }) {
  const configured = new Map(reels.map((r) => [r.ig_media_id, r]));
  const seen = new Set();
  const cards = posts.map((p) => {
    seen.add(p.id);
    return { id: p.id, thumb: p.thumbnail_url || p.media_url, caption: p.caption || '', date: p.timestamp, type: p.media_product_type === 'REELS' ? 'Reel' : 'Post', reel: configured.get(p.id) };
  });
  // Reels set up earlier that didn't come back from Instagram (older posts, or API down).
  for (const r of reels) {
    if (!seen.has(r.ig_media_id)) cards.push({ id: r.ig_media_id, thumb: r.thumbnail_url, caption: r.caption, date: r.created_at, type: 'Reel', reel: r });
  }
  return html`
<header class="page-head"><h1>Reels</h1></header>
<p class="lead">Pick a reel and the 1 to ${MAX_REEL_LINKS} products in it. When someone comments the reel’s keyword, they get a DM with a button to that reel’s page, and every product there opens on your website.</p>
${postsError ? html`<p class="flash warn">Couldn’t load your Instagram posts: ${postsError}. Reels you already set up are still listed.</p>` : ''}
${cards.length ? html`
<ul class="reel-cards">
  ${cards.map((c) => html`<li class="reel-card">
    <a href="/admin/reels/${c.id}">
      ${c.thumb ? html`<img src="${c.thumb}" alt="" loading="lazy">` : html`<span class="reel-card-empty"></span>`}
      <span class="reel-card-status">${c.reel ? (c.reel.active ? html`<span class="chip chip-live">Live</span>` : html`<span class="chip chip-off">Paused</span>`) : html`<span class="chip chip-new">Not set up</span>`}</span>
    </a>
    <div class="reel-card-body">
      <p class="reel-card-title">${c.reel?.headline || c.caption.slice(0, 70) || `${c.type} ${c.id}`}</p>
      ${c.reel
        ? html`<p class="reel-card-meta">${c.reel.link_count} products, ${c.reel.dm_count} DMs, ${c.reel.click_count} clicks</p>`
        : html`<p class="reel-card-meta">${c.type}${c.date ? `, ${new Date(c.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</p>`}
      <a class="btn ${c.reel ? '' : 'primary'}" href="/admin/reels/${c.id}">${c.reel ? 'Edit' : 'Set up'}</a>
    </div>
  </li>`)}
</ul>` : html`<p class="empty">No posts found. Post a reel on Instagram, then refresh this page.</p>`}`;
}

export function reelValues(reel, post) {
  if (reel) {
    return {
      headline: reel.headline, subtitle: reel.subtitle, slug: reel.slug, keywords: reel.keywords.join(', '), dm_message: reel.dm_message,
      button_text: reel.button_text, public_reply: reel.public_reply, active: reel.active, linkIds: reel.links.map((l) => l.id),
    };
  }
  return {
    headline: '', subtitle: '', slug: '', keywords: 'LINK', dm_message: 'Hey @{username}! Here’s everything from the reel 👇',
    button_text: 'Shop now', public_reply: 'Sent you a DM 📩', active: true, linkIds: [], caption: post?.caption || '',
  };
}

export function reelFormPage({ mediaId, post, reel, links, values, pageUrl, dmUrl, csrf }) {
  const v = values;
  const picked = [].concat(v.linkIds || []).map(Number);
  const byId = new Map(links.map((l) => [l.id, l]));
  const thumbSrc = post?.thumbnail_url || post?.media_url || reel?.thumbnail_url || '';
  const permalink = post?.permalink || reel?.permalink || '';
  const caption = post?.caption || reel?.caption || '';
  return html`
<header class="page-head">
  <div><a class="back" href="/admin/reels">Reels</a><h1>${reel ? 'Edit reel' : 'Set up reel'}</h1></div>
  ${reel ? html`<div class="head-actions">
    <button type="button" class="btn" data-copy="${dmUrl}">Copy DM link</button>
    <a class="btn" href="/r/${reel.slug}?preview=1" target="_blank" rel="noopener">Preview page</a>
  </div>` : ''}
</header>

<div class="reel-editor">
  <aside class="reel-preview">
    ${thumbSrc ? html`<img src="${thumbSrc}" alt="Reel thumbnail">` : html`<span class="reel-card-empty"></span>`}
    ${caption ? html`<p class="caption">${caption.slice(0, 240)}</p>` : ''}
    ${permalink ? html`<a href="${permalink}" target="_blank" rel="noopener">Open on Instagram</a>` : ''}
    <p class="hint">Post ID ${mediaId}</p>
  </aside>

  <form class="form-grid" method="post" action="/admin/reels/${mediaId}" data-reel-form>
    ${csrfField(csrf)}
    <input type="hidden" name="permalink" value="${permalink}">
    <input type="hidden" name="thumbnail_url" value="${post?.thumbnail_url || post?.media_url || ''}">
    <input type="hidden" name="video_url" value="${post?.media_type === 'VIDEO' ? post.media_url || '' : ''}">
    <input type="hidden" name="caption" value="${caption.slice(0, 500)}">

    <section class="panel">
      <h2>Reel page</h2>
      <label>Headline <span class="hint">Big title on the page</span><input name="headline" value="${v.headline}" maxlength="80" placeholder="Winter bulbs to plant now" required></label>
      <label>Subtitle <span class="hint">Optional. Default: “N picks from this reel, in the order they appear.”</span><input name="subtitle" value="${v.subtitle}" maxlength="200"></label>
      <label>Page link <span class="hint">${pageUrl}/r/</span><input name="slug" value="${v.slug}" maxlength="60" placeholder="winter-bulbs" pattern="[a-zA-Z0-9-]*"></label>
      <label class="check"><input type="checkbox" name="active" ${v.active ? raw('checked') : ''}> Live (sends DMs and shows the page)</label>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Products</h2><span class="counter" data-counter>${picked.length} / ${MAX_REEL_LINKS}</span></div>
      <p class="hint">Pick 1 to ${MAX_REEL_LINKS}, in the order they appear in the reel. <a href="/admin/links">Add products</a> first if they’re not in the list.</p>
      <ol class="picked" data-picked data-max="${MAX_REEL_LINKS}">
        ${picked.map((id) => byId.get(id)).filter(Boolean).map((l) => pickedItem(l))}
      </ol>
      <p class="empty small" data-picked-empty ${picked.length ? raw('hidden') : ''}>No products picked yet.</p>
      <details class="catalog" ${picked.length ? '' : raw('open')}>
        <summary>Add from your products (${links.length})</summary>
        ${links.length ? html`
        <input type="search" placeholder="Search products" aria-label="Search products" data-catalog-search>
        <ul class="catalog-list" data-catalog>
          ${links.map((l) => html`<li data-name="${l.title.toLowerCase()}">
            ${thumb(l.image_url)}<span>${l.title}<small>${priceLine(l)}${l.active ? '' : ', archived'}</small></span>
            <button type="button" class="btn small" data-pick="${l.id}" ${picked.includes(l.id) ? raw('disabled') : ''}>Add</button>
          </li>`)}
        </ul>
        <div hidden data-picked-templates>${links.map((l) => html`<template data-for="${l.id}">${pickedItem(l)}</template>`)}</div>`
        : html`<p class="empty small">No products yet. <a href="/admin/links">Paste product links</a> first.</p>`}
      </details>
      <p class="flash err" data-picked-error hidden role="alert"></p>
    </section>

    <section class="panel">
      <h2>Comment and DM</h2>
      <label>Keywords <span class="hint">Comma-separated. A comment containing any of these gets the DM.</span><input name="keywords" value="${v.keywords}" required placeholder="LINK, SHOP"></label>
      <label>DM message <span class="hint">{username} becomes the commenter’s name</span><textarea name="dm_message" rows="3" maxlength="600">${v.dm_message}</textarea></label>
      <div class="row2">
        <label>Button text <span class="hint">Max 20 characters</span><input name="button_text" value="${v.button_text}" maxlength="20"></label>
        <label>Public reply <span class="hint">Optional, posted under the comment</span><input name="public_reply" value="${v.public_reply}" maxlength="200"></label>
      </div>
      ${reel ? html`<p class="hint">The DM button opens <code>${dmUrl}</code></p>` : ''}
    </section>

    <div class="form-actions">
      <button class="btn primary" type="submit">${reel ? 'Save reel' : 'Create reel page'}</button>
      <a class="btn" href="/admin/reels">Cancel</a>
    </div>
  </form>
</div>
${reel ? html`
<form class="danger-zone" method="post" action="/admin/reels/${mediaId}/delete" data-confirm="Remove this reel’s page? Comments on it will stop getting DMs. Your products stay.">
  ${csrfField(csrf)}
  <button class="btn danger" type="submit">Remove reel page</button>
</form>` : ''}`;
}

function pickedItem(l) {
  return html`<li class="picked-item" data-id="${l.id}">
    <input type="hidden" name="linkIds" value="${l.id}">
    ${thumb(l.image_url)}
    <span>${l.title}<small>${priceLine(l)}${l.active ? '' : ', archived (hidden from the page)'}</small></span>
    <div class="image-tools">
      <button type="button" class="icon" data-move="-1" aria-label="Move up">↑</button>
      <button type="button" class="icon" data-move="1" aria-label="Move down">↓</button>
      <button type="button" class="icon" data-unpick aria-label="Remove ${l.title}">✕</button>
    </div>
  </li>`;
}

// ---------------------------------------------------------------- activity
function resultChip(result) {
  const label = {
    sent: 'DM sent',
    error: 'Failed',
    processing: 'Sending',
    'skip:no-keyword': 'No keyword',
    'skip:unmapped-reel': 'Reel not set up',
    'skip:own-comment': 'Your own comment',
    'skip:already-sent-to-user': 'Already got a DM',
    'skip:malformed': 'Unreadable',
  }[result] || result;
  const cls = result === 'sent' ? 'live' : result === 'error' ? 'cancelled' : 'off';
  return html`<span class="chip chip-${cls}">${label}</span>`;
}

export function activityPage({ rows }) {
  return html`
<header class="page-head"><h1>DM activity</h1></header>
<p class="lead">Every comment Instagram sent to the server, and what happened to it. Newest first.</p>
${rows.length ? html`
<div class="table-wrap"><table>
  <thead><tr><th>Time</th><th>From</th><th>Comment</th><th>Reel</th><th>Result</th></tr></thead>
  <tbody>${rows.map((a) => html`<tr>
    <td>${fmtDate(a.created_at)}</td>
    <td>@${a.username || '?'}</td>
    <td>${a.text}${a.error ? html`<small class="warn-text">${a.error}</small>` : ''}</td>
    <td>${a.slug ? html`<a href="/admin/reels/${a.reel_id}">${a.headline || a.slug}</a>` : html`<small>${a.reel_id || ''}</small>`}</td>
    <td>${resultChip(a.result)}</td>
  </tr>`)}</tbody>
</table></div>` : html`<p class="empty">Nothing yet. Comment a reel’s keyword from a tester account and it will show up here.</p>`}`;
}

// ---------------------------------------------------------------- settings
const COLOR_FIELDS = [
  ['color_bg', 'Page background'], ['color_surface', 'Cards'], ['color_text', 'Text'], ['color_muted', 'Struck-through MRP'],
  ['color_primary', 'Buttons and accents'], ['color_on_primary', 'Text on buttons'], ['color_badge_bg', 'Badge background'],
  ['color_badge_text', 'Badge text'], ['color_strip_bg', 'Top strip background'], ['color_strip_text', 'Top strip text'],
];

export function settingsPage({ settings: s, connection, csrf }) {
  const fontSelect = (name, value) => html`<select name="${name}">${FONTS.map((f) => html`<option ${f === value ? raw('selected') : ''}>${f}</option>`)}</select>`;
  return html`
<header class="page-head"><h1>Brand & settings</h1><a class="btn" href="/" target="_blank" rel="noopener">View reel pages</a></header>
<form class="form-grid" method="post" action="/admin/settings">
  ${csrfField(csrf)}
  <section class="panel">
    <h2>Brand</h2>
    <div class="row2">
      <label>Brand name<input name="brand_name" value="${s.brand_name}" required maxlength="60"></label>
      <label>Website <span class="hint">Where “Visit website” buttons go</span><input type="url" name="website_url" value="${s.website_url}" placeholder="https://yourwebsite.com"></label>
    </div>
    <div class="row2">
      <label>Logo link <span class="hint">A wide logo works best</span><input name="logo_url" value="${s.logo_url}" placeholder="https://"></label>
      <label>Instagram handle<input name="instagram_handle" value="${s.instagram_handle}" placeholder="yourbrand"></label>
    </div>
  </section>

  <section class="panel">
    <h2>Words on the reel page</h2>
    <label>Top strip <span class="hint">One message per line, scrolls across the top. Leave empty to hide.</span><textarea name="announcement" rows="3">${s.announcement}</textarea></label>
    <div class="row2">
      <label>Small line above the headline<input name="page_kicker" value="${s.page_kicker}" maxlength="40"></label>
      <label>Product button<input name="card_button" value="${s.card_button}" maxlength="30" required></label>
    </div>
    <label>End-of-page title<input name="cta_title" value="${s.cta_title}" maxlength="80"></label>
    <label>End-of-page text<input name="cta_text" value="${s.cta_text}" maxlength="200"></label>
    <label class="narrow">End-of-page button<input name="cta_button" value="${s.cta_button}" maxlength="40" required></label>
    <label>Trust points <span class="hint">One per line, up to 4, shown with a tick</span><textarea name="trust_points" rows="4">${s.trust_points}</textarea></label>
    <label>Footer line<input name="footer_text" value="${s.footer_text}" maxlength="120"></label>
    <label class="check"><input type="checkbox" name="show_prices" ${s.show_prices === '1' ? raw('checked') : ''}> Show prices on product cards</label>
    <label class="check"><input type="checkbox" name="utm_enabled" ${s.utm_enabled === '1' ? raw('checked') : ''}> Tag website links for analytics (utm_source=instagram, utm_medium=dm, utm_campaign=&lt;reel&gt;)</label>
  </section>

  <section class="panel">
    <div class="panel-head"><h2>Look</h2><span class="hint">Preset: ${PRESETS[s.theme_preset]?.label || 'Custom'}</span></div>
    <div class="color-grid">
      ${COLOR_FIELDS.map(([k, label]) => html`<label class="color-field"><input type="color" name="${k}" value="${s[k]}"><span>${label}</span></label>`)}
    </div>
    <div class="row2">
      <label>Heading font${fontSelect('font_heading', s.font_heading)}</label>
      <label>Body font${fontSelect('font_body', s.font_body)}</label>
    </div>
    <div class="row2">
      <label>Card corners (px)<input name="radius_card" value="${s.radius_card}" inputmode="numeric" maxlength="2"></label>
      <label>Button corners (px) <span class="hint">99 = pill</span><input name="radius_button" value="${s.radius_button}" inputmode="numeric" maxlength="2"></label>
    </div>
    <label class="check"><input type="checkbox" name="button_case" value="uppercase" ${s.button_case === 'uppercase' ? raw('checked') : ''}> Button text in CAPITALS</label>
  </section>
  <div class="form-actions"><button class="btn primary" type="submit">Save settings</button></div>
</form>

<section class="panel">
  <h2>Start from a preset</h2>
  <p class="hint">Replaces the colours, fonts and corners above. Your words and links stay.</p>
  <div class="row-actions">
    ${Object.entries(PRESETS).map(([key, p]) => html`<form method="post" action="/admin/settings/preset">${csrfField(csrf)}<input type="hidden" name="preset" value="${key}">
      <button class="btn preset-btn" type="submit"><span class="swatches">${['color_bg', 'color_primary', 'color_badge_bg', 'color_text'].map((k) => html`<i style="background:${p[k]}"></i>`)}</span>${p.label}</button></form>`)}
  </div>
</section>

<section class="panel">
  <h2>Instagram connection</h2>
  <dl class="kv">
    <div><dt>Account</dt><dd>${connection.account ? `@${connection.account.username}` : html`<span class="warn-text">${connection.error || 'Not connected'}</span>`}</dd></div>
    <div><dt>Reel pages live at</dt><dd>${connection.baseUrl}${connection.baseUrlFromEnv ? '' : html`<small class="warn-text">Guessed from this browser. Set PUBLIC_BASE_URL in .env.</small>`}</dd></div>
    <div><dt>DM buttons open</dt><dd><code>${connection.dmBase}/l/&lt;page-link&gt;</code>${connection.dmBase !== connection.baseUrl ? html`<small>DM_LINK_BASE is set: that site must redirect /l/… to this one.</small>` : ''}</dd></div>
    <div><dt>Webhook URL for Meta</dt><dd><code>${connection.baseUrl}/webhook</code></dd></div>
    <div><dt>Sending DMs</dt><dd>${connection.dryRun ? html`<span class="warn-text">Test mode (DRY_RUN=1): DMs are only logged</span>` : 'Live'}</dd></div>
    <div><dt>One DM per person per reel</dt><dd>${connection.oneDmPerUser ? 'On' : 'Off'}</dd></div>
    <div><dt>Database</dt><dd>${connection.database}</dd></div>
  </dl>
</section>

${connection.demo ? html`
<section class="panel">
  <h2>Demo data</h2>
  <p class="hint">${connection.demo.description}</p>
  <form method="post" action="/admin/demo-data" data-confirm="Load the demo? It sets the brand and look, adds the demo products and sets up ${connection.demo.reels} reel page(s)." data-busy="Loading products from the website…">
    ${csrfField(csrf)}
    <button class="btn" type="submit">Load demo data</button>
  </form>
</section>` : ''}`;
}
