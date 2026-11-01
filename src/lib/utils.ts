// Date and formatting helpers. Days are handled as local 'YYYY-MM-DD' strings.

export function todayISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return todayISO(dt);
}

export function startOfWeek(iso: string) {
  // Week starts on Monday.
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const diff = (dt.getDay() + 6) % 7;
  return addDays(iso, -diff);
}

export function startOfMonth(iso: string) {
  return iso.slice(0, 8) + '01';
}

export function endOfMonth(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  return todayISO(new Date(y, m, 0));
}

export const AR_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const AR_MONTHS = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export function formatDate(iso?: string) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${AR_MONTHS[m - 1]} ${y}`;
}

export function formatDateTime(iso?: string) {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return iso;
  return `${formatDate(todayISO(dt))} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

export function dayName(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return AR_DAYS[new Date(y, m - 1, d).getDay()];
}

export function fullName(p?: { firstName?: string; lastName?: string } | null) {
  if (!p) return '—';
  return `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || '—';
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.ب`;
  return `${(bytes / 1024 / 1024).toFixed(1)} م.ب`;
}

export function inRange(iso: string | undefined, from?: string, to?: string) {
  if (!iso) return false;
  const d = iso.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export function round(n: number, digits = 2) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function normalize(s: string) {
  // Lenient Arabic search: ignore hamza forms, taa marbuta and diacritics.
  return s
    .toLowerCase()
    .replace(/[ً-ْ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
}

export function matches(haystack: (string | number | undefined | null)[], needle: string) {
  if (!needle.trim()) return true;
  const n = normalize(needle);
  return haystack.some((h) => h !== undefined && h !== null && normalize(String(h)).includes(n));
}

export function byId<T extends { id?: number }>(rows: T[] | undefined) {
  const map = new Map<number, T>();
  rows?.forEach((r) => r.id !== undefined && map.set(r.id, r));
  return map;
}
