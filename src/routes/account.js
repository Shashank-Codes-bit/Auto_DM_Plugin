import express from 'express';
import { safeNext } from '../auth.js';
import { loginPage } from '../views/admin.js';

/** The brand owner's login. There are no shopper accounts. */
export function accountRoutes({ repos, auth }) {
  const r = express.Router();
  const page = (res, view, status = 200) => res.status(status).type('html').send(String(view));

  // The login form has no session yet, so instead of a CSRF token it must come from this site.
  const sameSite = (req, res, next) => {
    const origin = req.get('origin') || req.get('referer') || '';
    if (origin) {
      try {
        if (new URL(origin).host !== req.get('host')) return res.status(403).send('Please log in from this website.');
      } catch {
        return res.status(403).send('Please log in from this website.');
      }
    }
    next();
  };

  r.get('/login', async (req, res) => {
    if (req.user) return res.redirect(safeNext(req.query.next));
    const { brand_name } = await repos.settings.getAll();
    page(res, loginPage({ next: safeNext(req.query.next), brand: brand_name, error: auth.enabled ? '' : 'Set ADMIN_PHONE and ADMIN_PASSWORD in .env, then restart.' }));
  });

  r.post('/login', sameSite, async (req, res) => {
    const { brand_name } = await repos.settings.getAll();
    const next = safeNext(req.body.next);
    const phone = String(req.body.phone || '').slice(0, 20);
    if (auth.tooManyAttempts(req)) {
      return page(res, loginPage({ next, phone, brand: brand_name, error: 'Too many tries. Wait 15 minutes and try again.' }), 429);
    }
    if (!auth.check(phone, req.body.password)) {
      auth.recordFailure(req);
      return page(res, loginPage({ next, phone, brand: brand_name, error: 'That mobile number and password don’t match.' }), 401);
    }
    auth.login(req, res);
    res.redirect(303, next);
  });

  r.post('/logout', (req, res) => {
    auth.logout(res);
    res.redirect(303, '/login');
  });

  return r;
}
