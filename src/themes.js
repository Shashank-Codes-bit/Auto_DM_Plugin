// The reel page's look, as CSS variables. A preset fills these in; the owner can then change any of them in Settings.

export const FONTS = [
  'Inter', 'Figtree', 'DM Sans', 'Manrope', 'Poppins', 'Montserrat', 'Lato', 'Nunito', 'Outfit', 'Space Grotesk',
  'Bricolage Grotesque', 'Playfair Display', 'Lora', 'Fraunces', 'Cormorant Garamond', 'DM Serif Display',
];

const SERIF = new Set(['Playfair Display', 'Lora', 'Fraunces', 'Cormorant Garamond', 'DM Serif Display']);
export const fontStack = (name) => `"${name}", ${SERIF.has(name) ? 'Georgia, serif' : 'system-ui, sans-serif'}`;

/** Google Fonts stylesheet for the two theme fonts. */
export function fontHref(heading, body) {
  const families = [...new Set([heading, body].filter((f) => FONTS.includes(f)))];
  if (!families.length) return '';
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`).join('&')}&display=swap`;
}

export const THEME_KEYS = [
  'color_bg', 'color_surface', 'color_text', 'color_muted', 'color_primary', 'color_on_primary',
  'color_badge_bg', 'color_badge_text', 'color_strip_bg', 'color_strip_text',
  'font_heading', 'font_body', 'radius_card', 'radius_button', 'button_case',
];

export const COLOR_KEYS = THEME_KEYS.filter((k) => k.startsWith('color_'));

export const PRESETS = {
  default: {
    label: 'Clean (default)',
    color_bg: '#FAFAF7', color_surface: '#FFFFFF', color_text: '#16181D', color_muted: '#6B7078',
    color_primary: '#16181D', color_on_primary: '#FFFFFF', color_badge_bg: '#FDE8E8', color_badge_text: '#B42318',
    color_strip_bg: '#16181D', color_strip_text: '#FFFFFF',
    font_heading: 'Bricolage Grotesque', font_body: 'Figtree', radius_card: '16', radius_button: '12', button_case: 'none',
  },
  // Matched to plantstore.live: cream background, forest green, Playfair Display headings over Inter, pill buttons.
  plantstore: {
    label: 'Plant Store (cream & forest green)',
    color_bg: '#F7F4EC', color_surface: '#FFFFFF', color_text: '#1D2A20', color_muted: '#9AA093',
    color_primary: '#234D33', color_on_primary: '#F7F4EC', color_badge_bg: '#F0E3D0', color_badge_text: '#8A5A1D',
    color_strip_bg: '#234D33', color_strip_text: '#F2EEDF',
    font_heading: 'Playfair Display', font_body: 'Inter', radius_card: '18', radius_button: '99', button_case: 'uppercase',
  },
};

/** Keeps only valid theme values, falling back to the default preset. */
export function cleanTheme(input = {}) {
  const base = PRESETS.default;
  const out = {};
  for (const k of THEME_KEYS) {
    const v = String(input[k] ?? '').trim();
    if (k.startsWith('color_')) out[k] = /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : base[k];
    else if (k.startsWith('font_')) out[k] = FONTS.includes(v) ? v : base[k];
    else if (k.startsWith('radius_')) out[k] = /^\d{1,2}$/.test(v) ? v : base[k];
    else if (k === 'button_case') out[k] = v === 'uppercase' ? 'uppercase' : 'none';
  }
  return out;
}

/** CSS custom properties for the reel page. Values are validated by cleanTheme, so they're safe inside <style>. */
export function themeCss(settings) {
  const t = cleanTheme(settings);
  return `:root{--bg:${t.color_bg};--surface:${t.color_surface};--text:${t.color_text};--muted:${t.color_muted};` +
    `--primary:${t.color_primary};--on-primary:${t.color_on_primary};--badge-bg:${t.color_badge_bg};--badge-text:${t.color_badge_text};` +
    `--strip-bg:${t.color_strip_bg};--strip-text:${t.color_strip_text};` +
    `--font-heading:${fontStack(t.font_heading)};--font-body:${fontStack(t.font_body)};` +
    `--radius-card:${t.radius_card}px;--radius-button:${t.radius_button}px;--button-case:${t.button_case};}`;
}
