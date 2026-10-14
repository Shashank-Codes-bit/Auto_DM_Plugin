import crypto from 'node:crypto';
import { normalizePhone } from './util.js';

const COOKIE = 'sid';
const SESSION_DAYS = 30;

const hmac = (secret, value) => crypto.createHmac('sha256', secret).update(value).digest('base64url');
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}

export const safeNext = (n, fallback = '/admin') =>
  typeof n === 'string' && /^\/(?!\/)[\w\-./?=&%#]*$/.test(n) && !n.startsWith('/login') ? n : fallback;

/**
 * One login: the brand owner from .env (ADMIN_PHONE + ADMIN_PASSWORD). There are no shopper accounts.
 * The session is a signed, HttpOnly cookie. It's signed with a key that includes the password,
 * so changing ADMIN_PASSWORD logs everyone out. Every POST made while logged in must carry a CSRF token.
 */
export function createAuth({ secret, adminPhone, adminPassword }) {
  const attempts = new Map();
  const ownerPhone = normalizePhone(adminPhone);
  const key = hmac(secret, `owner:${ownerPhone}:${adminPassword}`);
  const owner = ownerPhone && adminPassword ? { phone: ownerPhone, role: 'admin' } : null;

  function sessionToken(req) {
    const token = readCookie(req, COOKIE);
    const [exp, sig] = token.split('.');
    if (!owner || !exp || !sig || Number(exp) < Date.now()) return null;
    return safeEqual(sig, hmac(key, `session:${exp}`)) ? token : null;
  }

  return {
    enabled: Boolean(owner),

    /** True when phone + password match the owner in .env. */
    check(phone, password) {
      if (!owner) return false;
      // Compare both even when the phone is wrong, so timing doesn't reveal which part failed.
      const phoneOk = safeEqual(hmac(key, String(normalizePhone(phone))), hmac(key, ownerPhone));
      const passOk = safeEqual(hmac(key, String(password ?? '')), hmac(key, adminPassword));
      return phoneOk && passOk;
    },

    /** Loads the owner (if logged in) into req.user / res.locals.user, and the CSRF token. */
    load(req, res, next) {
      const token = sessionToken(req);
      req.user = token ? owner : null;
      req.csrf = token ? hmac(key, `csrf:${token}`) : '';
      res.locals.user = req.user;
      res.locals.csrf = req.csrf;
      next();
    },

    /** Rejects logged-in POSTs that lack the session's CSRF token. */
    checkCsrf(req, res, next) {
      if (req.method === 'GET' || req.method === 'HEAD' || !req.user) return next();
      const sent = req.get('x-csrf-token') || req.body?._csrf || '';
      if (!safeEqual(sent, req.csrf)) return res.status(403).send('This form expired. Go back, refresh the page and try again.');
      next();
    },

    /** Login rate limit: 10 failed tries per IP per 15 minutes. */
    tooManyAttempts(req) {
      const a = attempts.get(req.ip);
      if (a && Date.now() > a.reset) attempts.delete(req.ip);
      return (attempts.get(req.ip)?.n || 0) >= 10;
    },
    recordFailure(req) {
      const now = Date.now();
      const a = attempts.get(req.ip) || { n: 0, reset: now + 15 * 60_000 };
      a.n++;
      attempts.set(req.ip, a);
    },

    login(req, res) {
      attempts.delete(req.ip);
      const exp = Date.now() + SESSION_DAYS * 86_400_000;
      res.cookie(COOKIE, `${exp}.${hmac(key, `session:${exp}`)}`, {
        httpOnly: true,
        sameSite: 'lax',
        secure: req.secure,
        path: '/',
        maxAge: SESSION_DAYS * 86_400_000,
      });
    },

    logout(res) {
      res.clearCookie(COOKIE, { path: '/' });
    },

    requireAdmin(req, res, next) {
      if (req.user) return next();
      if (req.method !== 'GET') return res.status(401).json({ error: 'Please log in again.' });
      return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    },
  };
}
