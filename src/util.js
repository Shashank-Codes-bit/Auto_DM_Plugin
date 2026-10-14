export class ValidationError extends Error {}

export const slugify = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

// "499" / "499.5" / "1,299.00" / "Rs. 1,299" -> paise. Empty -> null.
export function parseRupees(value, field = 'Price') {
  const s = String(value ?? '').replace(/[,₹\s]|^rs\.?/gi, '');
  if (s === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new ValidationError(`${field} must be a number like 499 or 499.50`);
  return Math.round(Number(s) * 100);
}

export function formatMoney(paise) {
  const rupees = (paise ?? 0) / 100;
  return '₹' + rupees.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export const paiseToInput = (paise) => (paise == null ? '' : String(paise / 100));

export const discountPercent = (price, mrp) => (price != null && mrp && mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0);

// "+91 98765 43210" / "098765-43210" -> "9876543210"; null if it isn't an Indian mobile number.
export function normalizePhone(value) {
  const phone = String(value ?? '').trim().replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(phone) ? phone : null;
}

/** A clean http(s) URL string, or null. */
export function cleanUrl(value) {
  try {
    const u = new URL(String(value ?? '').trim());
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

/** "https://www.plantstore.live/path" -> "plantstore.live" */
export const hostLabel = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
