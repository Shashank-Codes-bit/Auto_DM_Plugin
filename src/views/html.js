// Tiny HTML templating: html`...` escapes every interpolated value unless it is
// itself html`...` output (or raw()). Arrays are joined. null/false render nothing.

class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const raw = (value) => new SafeHtml(String(value ?? ''));

function render(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    out += render(v) + strings[i + 1];
  });
  return new SafeHtml(out);
}

/** JSON safe to embed inside a <script> tag. */
export const jsonScript = (data) => raw(JSON.stringify(data).replace(/</g, '\\u003c'));
