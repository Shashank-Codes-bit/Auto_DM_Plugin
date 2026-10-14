import { PRESETS } from '../themes.js';

export const SETTING_DEFAULTS = {
  // Brand
  brand_name: 'Your brand',
  website_url: '',
  logo_url: '',
  instagram_handle: '',
  // Words on the reel page
  announcement: '',
  page_kicker: 'From our reel',
  card_button: 'View on website',
  cta_title: 'There’s more where this came from',
  cta_text: 'Browse the full collection on our website.',
  cta_button: 'Visit our website',
  trust_points: '',
  footer_text: '',
  show_prices: '1',
  // Tag outbound links so the brand sees this traffic in its own analytics
  utm_enabled: '1',
  // Look
  theme_preset: 'default',
  ...Object.fromEntries(Object.entries(PRESETS.default).filter(([k]) => k !== 'label')),
  checklist_dismissed: '',
};

export function settingsRepo(db) {
  return {
    async getAll() {
      const rows = await db.query('SELECT key, value FROM settings');
      const out = { ...SETTING_DEFAULTS };
      for (const { key, value } of rows) if (key in out) out[key] = value;
      return out;
    },
    async update(values) {
      for (const [key, value] of Object.entries(values)) {
        if (!(key in SETTING_DEFAULTS) || value === undefined) continue;
        await db.query(
          'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
          [key, String(value ?? '')],
        );
      }
    },
  };
}
