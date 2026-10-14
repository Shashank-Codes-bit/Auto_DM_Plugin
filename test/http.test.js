import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { REEL_ID, fakeIg, fakeNet, login, seedReel, startApp } from './helpers.js';

const sign = (body, secret = 'secret') => 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
const commentBody = (text = 'LINK') =>
  JSON.stringify({ entry: [{ id: 'ME', changes: [{ field: 'comments', value: { id: 'c1', text, media: { id: REEL_ID }, from: { id: 'u1', username: 'bob' } } }] }] });
const postWebhook = (base, body, sig = sign(body)) =>
  fetch(`${base}/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, body });
const settle = () => new Promise((r) => setTimeout(r, 100));

test('webhook verification and signature checks', async () => {
  const app = await startApp();
  try {
    assert.equal(await (await fetch(`${app.base}/webhook?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=42`)).text(), '42');
    assert.equal((await fetch(`${app.base}/webhook?hub.mode=subscribe&hub.verify_token=no&hub.challenge=42`)).status, 403);
    const body = JSON.stringify({ entry: [] });
    assert.equal((await postWebhook(app.base, body, sign(body, 'wrong'))).status, 401);
    assert.equal((await postWebhook(app.base, body)).status, 200);
  } finally {
    app.close();
  }
});

test('a signed comment (direct from Meta or passed on unchanged) gets a DM linking to /l/<slug>', async () => {
  const app = await startApp();
  try {
    await seedReel(app.repos);
    await postWebhook(app.base, commentBody());
    await settle();
    assert.equal(app.ig.calls[0][3], 'https://dm.test/l/tulip-edit?src=dm');
  } finally {
    app.close();
  }
});

test('DM_LINK_BASE puts another site’s address in the DM; /l/<slug> redirects to the reel page', async () => {
  const app = await startApp({ overrides: { dmLinkBase: 'https://mehtamart.test' } });
  try {
    await seedReel(app.repos);
    await postWebhook(app.base, commentBody());
    await settle();
    assert.equal(app.ig.calls[0][3], 'https://mehtamart.test/l/tulip-edit?src=dm');
    const res = await fetch(`${app.base}/l/tulip-edit?src=dm`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/r/tulip-edit?src=dm');
  } finally {
    app.close();
  }
});

test('reel page: themed, escaped, every product goes through /go, and the visit is counted', async () => {
  const app = await startApp();
  try {
    const { links } = await seedReel(app.repos);
    await app.repos.links.update(links[0].id, { url: links[0].url, title: '<script>alert(1)</script>', price: '100', mrp: '150', active: true });
    await app.repos.settings.update({ brand_name: 'Plant Store', website_url: 'https://brand.test/', color_primary: '#234D33', font_heading: 'Playfair Display' });
    const html = await (await fetch(`${app.base}/r/tulip-edit?src=dm`)).text();
    assert.match(html, /--primary:#234D33/);
    assert.match(html, /family=Playfair\+Display/);
    assert.ok(!html.includes('<script>alert(1)'));
    assert.match(html, /&lt;script&gt;alert\(1\)/);
    assert.match(html, new RegExp(`href="/go/${links[0].id}\\?r=tulip-edit"`));
    assert.match(html, /href="\/go\/site\?r=tulip-edit"/);
    assert.match(html, /-33%/);
    const [{ n }] = await app.db.query("SELECT count(*)::int AS n FROM visits WHERE source = 'dm'");
    assert.equal(n, 1);
    assert.equal((await fetch(`${app.base}/r/nope`)).status, 404);
  } finally {
    app.close();
  }
});

test('/go redirects only to saved links, adds UTM tags and counts the click', async () => {
  const app = await startApp();
  try {
    const { links } = await seedReel(app.repos);
    await app.repos.settings.update({ website_url: 'https://brand.test/?ref=bio' });
    const res = await fetch(`${app.base}/go/${links[1].id}?r=tulip-edit`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    const to = new URL(res.headers.get('location'));
    assert.equal(to.origin + to.pathname, 'https://brand.test/products/p2');
    assert.equal(to.searchParams.get('utm_source'), 'instagram');
    assert.equal(to.searchParams.get('utm_medium'), 'dm');
    assert.equal(to.searchParams.get('utm_campaign'), 'tulip-edit');
    assert.equal(to.searchParams.get('utm_content'), `product-${links[1].id}`);

    const site = new URL((await fetch(`${app.base}/go/site?r=tulip-edit`, { redirect: 'manual' })).headers.get('location'));
    assert.equal(site.searchParams.get('ref'), 'bio');
    assert.equal(site.searchParams.get('utm_content'), 'website-button');

    assert.equal((await fetch(`${app.base}/go/99999`, { redirect: 'manual' })).status, 404);
    assert.equal((await fetch(`${app.base}/go/https%3A%2F%2Fevil.test`, { redirect: 'manual' })).status, 404);

    const [{ n }] = await app.db.query('SELECT count(*)::int AS n FROM clicks');
    assert.equal(n, 2);
    const [reel] = await app.repos.reels.list();
    assert.equal(reel.click_count, 2);

    await app.repos.settings.update({ utm_enabled: '0' });
    const plain = await fetch(`${app.base}/go/${links[1].id}`, { redirect: 'manual' });
    assert.equal(plain.headers.get('location'), 'https://brand.test/products/p2');
  } finally {
    app.close();
  }
});

test('admin requires the owner login and a CSRF token', async () => {
  const app = await startApp();
  try {
    const anon = await fetch(`${app.base}/admin`, { redirect: 'manual' });
    assert.equal(anon.status, 302);
    assert.equal(anon.headers.get('location'), '/login?next=%2Fadmin');
    const wrong = await fetch(`${app.base}/login`, { method: 'POST', body: new URLSearchParams({ phone: '9000000001', password: 'nope' }) });
    assert.equal(wrong.status, 401);

    const { cookie, csrf, location } = await login(app.base);
    assert.equal(location, '/admin');
    const form = { url: 'https://brand.test/products/kurta', title: 'Kurta', price: '999', active: 'on' };
    const noCsrf = await fetch(`${app.base}/admin/links`, { method: 'POST', headers: { cookie }, body: new URLSearchParams(form), redirect: 'manual' });
    assert.equal(noCsrf.status, 403);
    const ok = await fetch(`${app.base}/admin/links`, { method: 'POST', headers: { cookie }, body: new URLSearchParams({ ...form, _csrf: csrf }), redirect: 'manual' });
    assert.equal(ok.status, 303);
    const [link] = await app.repos.links.list();
    assert.equal(link.title, 'Kurta');
    assert.equal(link.fetch_status, 'manual');

    for (const path of ['/admin', '/admin/links', `/admin/links/${link.id}`, '/admin/reels', `/admin/reels/${REEL_ID}`, '/admin/activity', '/admin/settings']) {
      assert.equal((await fetch(`${app.base}${path}`, { headers: { cookie } })).status, 200, path);
    }
  } finally {
    app.close();
  }
});

test('pasting one link shows a filled-in preview; pasting several adds them', async () => {
  const page = (name, price) => ({ body: `<meta property="og:title" content="${name}"><meta property="product:price:amount" content="${price}">` });
  const net = fakeNet({ 'https://brand.test/a': page('Tulip', '1095'), 'https://brand.test/b': page('Lily', '1195'), 'https://brand.test/c': page('Rose', '99') });
  const app = await startApp({ net });
  try {
    const { cookie, csrf } = await login(app.base);
    const add = (urls) =>
      fetch(`${app.base}/admin/links/add`, { method: 'POST', headers: { cookie }, body: new URLSearchParams({ urls, _csrf: csrf }), redirect: 'manual' });

    const preview = await (await add('https://brand.test/a')).text();
    assert.match(preview, /Check and save/);
    assert.match(preview, /value="Tulip"/);
    assert.match(preview, /value="1095"/);
    assert.equal((await app.repos.links.list()).length, 0);

    const bulk = await add('https://brand.test/b\nhttps://brand.test/c\nhttps://brand.test/missing');
    assert.equal(bulk.status, 200);
    assert.match(await bulk.text(), /Added 2 of 3/);
    assert.deepEqual((await app.repos.links.list()).map((l) => l.title).sort(), ['Lily', 'Rose']);
  } finally {
    app.close();
  }
});

test('settings save the brand and look; presets replace only the look', async () => {
  const app = await startApp();
  try {
    const { cookie, csrf } = await login(app.base, { csrfPage: '/admin/settings' });
    const post = (path, body) =>
      fetch(`${app.base}${path}`, { method: 'POST', headers: { cookie }, body: new URLSearchParams({ ...body, _csrf: csrf }), redirect: 'manual' });
    const res = await post('/admin/settings', {
      brand_name: 'Plant Store', website_url: 'https://plantstore.live', card_button: 'View', cta_button: 'Shop all',
      color_primary: '#123456', color_bg: 'red;}body{display:none', font_heading: 'Comic Sans', radius_button: '99', button_case: 'uppercase',
    });
    assert.equal(res.status, 303);
    let s = await app.repos.settings.getAll();
    assert.equal(s.website_url, 'https://plantstore.live/');
    assert.equal(s.color_primary, '#123456');
    assert.equal(s.color_bg, '#FAFAF7'); // invalid colour falls back to the default
    assert.equal(s.font_heading, 'Bricolage Grotesque'); // fonts come from a fixed list
    assert.equal(s.button_case, 'uppercase');

    await post('/admin/settings/preset', { preset: 'plantstore' });
    s = await app.repos.settings.getAll();
    assert.equal(s.color_primary, '#234D33');
    assert.equal(s.font_heading, 'Playfair Display');
    assert.equal(s.brand_name, 'Plant Store');
  } finally {
    app.close();
  }
});

test('Load demo data sets up Plant Store on the 4th–6th newest reels, using saved details when the site is unreachable', async () => {
  const ig = fakeIg();
  const ids = ['600', '500', '400', '300', '200', '100'];
  ig.listMedia = async () => ({ data: ids.map((id) => ({ id, media_product_type: 'REELS', media_type: 'VIDEO', media_url: `https://cdn.test/${id}.mp4`, thumbnail_url: `https://cdn.test/${id}.jpg` })) });
  const app = await startApp({ ig, net: fakeNet() });
  try {
    const { cookie, csrf } = await login(app.base, { csrfPage: '/admin/settings' });
    const res = await fetch(`${app.base}/admin/demo-data`, { method: 'POST', headers: { cookie }, body: new URLSearchParams({ _csrf: csrf }), redirect: 'manual' });
    assert.equal(res.status, 303);
    const reels = await app.repos.reels.list();
    assert.deepEqual(reels.map((r) => r.ig_media_id).sort(), ['100', '200', '300']);
    assert.equal((await app.repos.links.list()).length, 23);
    const s = await app.repos.settings.getAll();
    assert.equal(s.brand_name, 'Plant Store');
    assert.equal(s.color_bg, '#F7F4EC');
    const html = await (await fetch(`${app.base}/r/winter-bulbs`)).text();
    assert.match(html, /Winter bulbs to plant now/);
    assert.match(html, /Shop all at plantstore.live/);
    assert.match(html, /<video src="https:\/\/cdn.test\/300.mp4"/);
  } finally {
    app.close();
  }
});
