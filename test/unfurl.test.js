import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateAddress, parseProductHtml, parseShopifyProduct, safeFetch, unfurl } from '../src/unfurl.js';
import { checkLink, previewLink } from '../src/linkService.js';
import { fakeNet, setup } from './helpers.js';

const SHOPIFY = {
  product: {
    title: 'Dutch Tulip Pink Impression &amp; Co',
    image: { src: '//cdn.shopify.com/tulip.jpg' },
    variants: [{ price: '1095.00', compare_at_price: '1595.00', available: true }],
  },
};

const JSON_LD_PAGE = `<html><head><title>Ignore me</title>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Brand"},
{"@type":"Product","name":"Blue Pottery Planter","image":["/img/planter.webp"],"offers":{"@type":"Offer","price":"999.00","priceCurrency":"INR"}}]}</script>
</head><body></body></html>`;

const OG_PAGE = `<html><head><title>Fallback title</title>
<meta property="og:title" content="Saffron &amp; Lily Bulbs">
<meta property="og:image" content="https://cdn.brand.test/saffron.jpg">
<meta property="product:price:amount" content="1,195.00">
<meta property="product:original_price:amount" content="2000">
</head></html>`;

test('reads Shopify product JSON: name, photo, price and MRP', () => {
  const p = parseShopifyProduct(SHOPIFY, 'https://brand.test/products/tulip');
  assert.deepEqual(p, { title: 'Dutch Tulip Pink Impression & Co', image_url: 'https://cdn.shopify.com/tulip.jpg', price_paise: 109500, mrp_paise: 159500 });
});

test('reads JSON-LD Product data, including inside @graph, with relative images', () => {
  const p = parseProductHtml(JSON_LD_PAGE, 'https://brand.test/p/planter');
  assert.equal(p.title, 'Blue Pottery Planter');
  assert.equal(p.image_url, 'https://brand.test/img/planter.webp');
  assert.equal(p.price_paise, 99900);
});

test('falls back to Open Graph tags', () => {
  const p = parseProductHtml(OG_PAGE, 'https://brand.test/x');
  assert.deepEqual(p, { title: 'Saffron & Lily Bulbs', image_url: 'https://cdn.brand.test/saffron.jpg', price_paise: 119500, mrp_paise: 200000 });
});

test('unfurl tries Shopify JSON first, then the HTML page', async () => {
  const net = fakeNet({
    'https://shop.test/products/tulip.json': { type: 'application/json', body: SHOPIFY },
    'https://other.test/products/planter': { body: JSON_LD_PAGE },
  });
  assert.equal((await unfurl('https://shop.test/products/tulip?variant=1', net)).price_paise, 109500);
  const p = await unfurl('https://other.test/products/planter', net);
  assert.equal(p.title, 'Blue Pottery Planter');
  assert.deepEqual(net.requested, ['https://shop.test/products/tulip.json', 'https://other.test/products/planter.json', 'https://other.test/products/planter']);
});

test('never fetches private or local addresses, even through a redirect', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1']) {
    assert.ok(isPrivateAddress(ip), ip);
  }
  assert.ok(!isPrivateAddress('93.184.216.34'));
  await assert.rejects(safeFetch('http://127.0.0.1/admin', fakeNet()), /isn’t a public website/);
  await assert.rejects(safeFetch('https://intranet.test/', fakeNet({}, { privateHosts: ['intranet.test'] })), /isn’t a public website/);
  const net = fakeNet({ 'https://brand.test/go': { status: 302, headers: { location: 'http://169.254.169.254/latest' } } });
  await assert.rejects(safeFetch('https://brand.test/go', net), /isn’t a public website/);
  await assert.rejects(safeFetch('file:///etc/passwd', net), /full link/);
});

test('previewLink copies the photo into our own storage', async () => {
  const { repos } = await setup();
  const net = fakeNet({
    'https://brand.test/x': { body: OG_PAGE },
    'https://cdn.brand.test/saffron.jpg': { type: 'image/jpeg', body: Buffer.from([0xff, 0xd8, 0xff]) },
  });
  const v = await previewLink('https://brand.test/x', { repos, net });
  assert.match(v.image_url, /^\/media\/[0-9a-f-]{36}$/);
  assert.equal(v.price, '1195');
  assert.equal(v.mrp, '2000');
  assert.equal((await repos.media.get(v.image_url.slice(7))).mime, 'image/jpeg');
});

test('the background check updates prices and flags pages that are gone', async () => {
  const { repos } = await setup();
  const live = await repos.links.create({ url: 'https://brand.test/x', title: 'Saffron', price: '999' }, { fetchStatus: 'ok' });
  const gone = await repos.links.create({ url: 'https://brand.test/gone', title: 'Gone', price: '10' }, { fetchStatus: 'ok' });
  const net = fakeNet({ 'https://brand.test/x': { body: OG_PAGE } });
  assert.equal(await checkLink(live, { repos, net }), 'ok');
  assert.equal(await checkLink(gone, { repos, net }), 'broken');
  const updated = await repos.links.get(live.id);
  assert.equal(updated.price_paise, 119500);
  assert.equal(updated.price_changed, true);
  assert.equal((await repos.links.get(gone.id)).fetch_status, 'broken');
  // Saving in the admin confirms the new price.
  await repos.links.update(live.id, { ...updated, price: '1195', mrp: '2000', active: true });
  assert.equal((await repos.links.get(live.id)).price_changed, false);
});
