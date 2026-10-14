import dns from 'node:dns/promises';
import net from 'node:net';
import { cleanUrl } from './util.js';

/**
 * "Paste a link and the card fills itself in": reads a product page on the brand's website and returns
 * { url, title, image_url, price_paise, mrp_paise }.
 *
 * Runs only from the admin panel and the background refresh, never while a shopper is waiting.
 * Order of sources: Shopify's product JSON (exact price and MRP), then JSON-LD Product data, then Open Graph tags.
 */

export class UnfurlError extends Error {
  constructor(message, { status = 0 } = {}) {
    super(message);
    this.status = status; // HTTP status of the page, when there was one (404 = the product is gone)
  }
}

const UA = 'Mozilla/5.0 (compatible; AutoDMLinkPreview/1.0; +https://github.com/Shashank-Codes-bit/Auto_DM_Plugin)';
const PAGE_LIMIT = 2 * 1024 * 1024;
const IMAGE_LIMIT = 3 * 1024 * 1024;
const TIMEOUT_MS = 8000;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

// ---------------------------------------------------------------- network safety

/** True for loopback, private, link-local and other addresses that must never be fetched (no SSRF). */
export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
    if (mapped) return isPrivateAddress(mapped[1]);
    return x === '::' || x === '::1' || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith('ff');
  }
  return true;
}

async function assertPublicHost(hostname, lookup) {
  const host = hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new UnfurlError(`Couldn’t find the website ${hostname}`);
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new UnfurlError('That address isn’t a public website');
}

/** fetch() with a timeout, a size cap, and a public-address check on every redirect hop. */
export async function safeFetch(rawUrl, { fetchImpl = fetch, lookup = dns.lookup, limit = PAGE_LIMIT, accept = '*/*' } = {}) {
  let url = cleanUrl(rawUrl);
  if (!url) throw new UnfurlError('Paste a full link that starts with https://');
  for (let hop = 0; hop < 5; hop++) {
    await assertPublicHost(new URL(url).hostname, lookup);
    const res = await fetchImpl(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': UA, accept, 'accept-language': 'en-IN,en;q=0.9' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = cleanUrl(new URL(res.headers.get('location'), url).toString());
      if (!url) throw new UnfurlError('The page redirected somewhere we can’t follow');
      continue;
    }
    if (!res.ok) throw new UnfurlError(res.status === 404 ? 'The page wasn’t found (404)' : `The website answered ${res.status}`, { status: res.status });
    if (Number(res.headers.get('content-length')) > limit) throw new UnfurlError('The page is too large');
    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > limit) throw new UnfurlError('The page is too large');
      chunks.push(chunk);
    }
    return { url, status: res.status, type: (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(), body: Buffer.concat(chunks) };
  }
  throw new UnfurlError('Too many redirects');
}

// ---------------------------------------------------------------- parsing

const toPaise = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n >= 0 && String(v).match(/\d/) ? Math.round(n * 100) : null;
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decode = (s) =>
  String(s ?? '')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();

const absolute = (src, base) => {
  if (!src) return '';
  try {
    const u = new URL(String(src).startsWith('//') ? `https:${src}` : src, base);
    return ['http:', 'https:'].includes(u.protocol) ? u.toString() : '';
  } catch {
    return '';
  }
};

/** Shopify's /products/<handle>.json */
export function parseShopifyProduct(json, url) {
  const p = json?.product;
  if (!p?.title) return null;
  const variants = (p.variants || []).filter((v) => v.price != null);
  const v = variants.find((x) => x.available !== false) || variants[0] || {};
  const price = toPaise(v.price);
  const mrp = toPaise(v.compare_at_price);
  return {
    title: decode(p.title),
    image_url: absolute(p.image?.src || p.images?.[0]?.src, url),
    price_paise: price,
    mrp_paise: mrp && price != null && mrp > price ? mrp : null,
  };
}

function* walkJsonLd(node) {
  if (Array.isArray(node)) for (const n of node) yield* walkJsonLd(n);
  else if (node && typeof node === 'object') {
    yield node;
    if (node['@graph']) yield* walkJsonLd(node['@graph']);
    if (node.hasVariant) yield* walkJsonLd(node.hasVariant);
  }
}

const isProduct = (n) => [].concat(n['@type'] || []).some((t) => /^(Product|ProductGroup)$/i.test(t));
const firstImage = (img) => {
  const i = Array.isArray(img) ? img[0] : img;
  return typeof i === 'string' ? i : i?.url || i?.contentUrl || '';
};

function offerPrice(offers) {
  for (const o of [].concat(offers || [])) {
    const p = toPaise(o.price ?? o.lowPrice ?? o.priceSpecification?.price);
    if (p != null) return p;
  }
  return null;
}

/** Product details from a product page's HTML: JSON-LD first, then Open Graph / meta tags. */
export function parseProductHtml(html, url) {
  const out = { title: '', image_url: '', price_paise: null, mrp_paise: null };

  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    for (const node of walkJsonLd(data)) {
      if (!isProduct(node)) continue;
      out.title ||= decode(node.name);
      out.image_url ||= absolute(firstImage(node.image), url);
      if (out.price_paise == null) {
        out.price_paise = offerPrice(node.offers);
        if (out.price_paise == null && node.hasVariant) out.price_paise = offerPrice([].concat(node.hasVariant).flatMap((v) => [].concat(v.offers || [])));
      }
    }
  }

  const meta = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = /\b(?:property|name|itemprop)=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /\bcontent=["']([^"']*)["']/i.exec(tag)?.[1];
    if (key && content != null && !(key in meta)) meta[key] = decode(content);
  }
  out.title ||= meta['og:title'] || meta['twitter:title'] || decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]);
  out.image_url ||= absolute(meta['og:image:secure_url'] || meta['og:image'] || meta['twitter:image'], url);
  if (out.price_paise == null) out.price_paise = toPaise(meta['product:price:amount'] || meta['og:price:amount'] || meta.price);
  const mrp = toPaise(meta['product:original_price:amount'] || meta['product:retailer_price:amount']);
  if (mrp && out.price_paise != null && mrp > out.price_paise) out.mrp_paise = mrp;
  return out.title ? out : null;
}

// ---------------------------------------------------------------- main

/** Reads a product page. Throws UnfurlError when the page can't be read or has no product details. */
export async function unfurl(rawUrl, opts = {}) {
  const url = cleanUrl(rawUrl);
  if (!url) throw new UnfurlError('Paste a full link that starts with https://');
  const u = new URL(url);

  // Shopify stores publish exact product data at /products/<handle>.json
  if (/\/products\/[^/]+\/?$/.test(u.pathname)) {
    const jsonUrl = `${u.origin}${u.pathname.replace(/\/$/, '')}.json`;
    try {
      const res = await safeFetch(jsonUrl, { ...opts, accept: 'application/json' });
      const parsed = parseShopifyProduct(JSON.parse(res.body.toString('utf8')), url);
      if (parsed) return { url, ...parsed };
    } catch {
      // Not a Shopify store, or the JSON is blocked: fall back to reading the page itself.
    }
  }

  const res = await safeFetch(url, { ...opts, accept: 'text/html,application/xhtml+xml' });
  const parsed = parseProductHtml(res.body.toString('utf8'), res.url);
  if (!parsed) throw new UnfurlError('Couldn’t find product details on that page. Fill them in yourself.');
  return { url, ...parsed };
}

/** Asks Shopify's image CDN for a card-sized copy (800px wide) instead of the original upload. */
export function cardSized(url) {
  try {
    const u = new URL(url);
    if ((u.hostname === 'cdn.shopify.com' || u.pathname.includes('/cdn/shop/')) && !u.searchParams.has('width')) u.searchParams.set('width', '800');
    return u.toString();
  } catch {
    return url;
  }
}

/** Downloads a product photo so the reel page doesn't depend on the brand's image server. */
export async function downloadImage(url, opts = {}) {
  const res = await safeFetch(cardSized(url), { ...opts, limit: IMAGE_LIMIT, accept: 'image/avif,image/webp,image/*' });
  if (!IMAGE_TYPES.includes(res.type)) throw new UnfurlError('That link isn’t a JPG, PNG, WebP or GIF image');
  return { buffer: res.body, mime: res.type };
}
