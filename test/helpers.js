import { openDb } from '../src/db/index.js';
import { createRepos } from '../src/repos/index.js';
import { createApp } from '../src/server.js';
import { config } from '../src/config.js';

export const REEL_ID = '18475694065114168';

export function fakeIg({ failButton = false } = {}) {
  const calls = [];
  return {
    calls,
    sendPrivateReplyButton: async (...a) => {
      if (failButton) throw new Error('template not supported');
      calls.push(['button', ...a]);
    },
    sendPrivateReply: async (...a) => calls.push(['text', ...a]),
    replyToComment: async (...a) => calls.push(['reply', ...a]),
    listMedia: async () => ({ data: [{ id: REEL_ID, caption: 'Tulips', media_product_type: 'REELS', media_type: 'VIDEO' }] }),
    getMedia: async (id) => ({ id, caption: 'Tulips', permalink: 'https://instagram.com/reel/x' }),
    getAccount: async () => ({ username: 'shop', user_id: 'ME' }),
  };
}

/**
 * Fake network for reading product pages: `pages` maps URL -> { status, type, body, headers }.
 * Every hostname resolves to a public address unless listed in `privateHosts`.
 */
export function fakeNet(pages = {}, { privateHosts = [] } = {}) {
  const requested = [];
  return {
    requested,
    lookup: async (host) => [{ address: privateHosts.includes(host) ? '10.0.0.5' : '93.184.216.34', family: 4 }],
    fetchImpl: async (url) => {
      requested.push(url);
      const page = pages[url];
      if (!page) return new Response('not found', { status: 404 });
      const body = typeof page.body === 'string' || Buffer.isBuffer(page.body) ? page.body : JSON.stringify(page.body);
      return new Response(body, { status: page.status || 200, headers: { 'content-type': page.type || 'text/html', ...page.headers } });
    },
  };
}

export async function setup() {
  const db = await openDb();
  const repos = createRepos(db);
  return { db, repos };
}

/** Creates `n` product links and a reel showing them. */
export async function seedReel(repos, { n = 2, keywords = 'LINK', active = 'on' } = {}) {
  const links = [];
  for (let i = 0; i < n; i++) {
    links.push(await repos.links.create({ url: `https://brand.test/products/p${i + 1}`, title: `Product ${i + 1}`, price: String(100 * (i + 1)), mrp: String(150 * (i + 1)) }));
  }
  const reel = await repos.reels.save(REEL_ID, { headline: 'Tulip edit', keywords, linkIds: links.map((l) => l.id), active });
  return { links, reel };
}

export const OWNER = { phone: '9000000001', password: 'owner-pass' };

export async function startApp({ ig = fakeIg(), net = fakeNet(), overrides = {} } = {}) {
  const { db, repos } = await setup();
  const app = createApp({
    db,
    ig,
    net,
    config: {
      ...config, adminPhone: OWNER.phone, adminPassword: OWNER.password, sessionSecret: 'test-secret', verifyToken: 'vt', appSecret: 'secret',
      publicBaseUrl: 'https://dm.test', dmLinkBase: '', dryRun: false, oneDmPerUser: false, ...overrides,
    },
  });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  return { db, repos, ig, net, base, close: () => server.close() };
}

/** Logs in through /login and returns the session cookie plus a CSRF token read from `csrfPage`. */
export async function login(base, { phone = OWNER.phone, password = OWNER.password, csrfPage = '/admin/links' } = {}) {
  const res = await fetch(`${base}/login`, { method: 'POST', body: new URLSearchParams({ phone, password }), redirect: 'manual' });
  if (res.status !== 303) throw new Error(`login failed with ${res.status}`);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const page = await (await fetch(`${base}${csrfPage}`, { headers: { cookie } })).text();
  const csrf = /name="_csrf" value="([^"]+)"/.exec(page)?.[1] || /data-csrf="([^"]+)"/.exec(page)?.[1];
  return { cookie, csrf, location: res.headers.get('location') };
}
