import { db } from '../db/db';

// Local access gate for the director.
// The password is never stored: we keep a PBKDF2-SHA256 hash with a random salt in IndexedDB.
// IMPORTANT: this gate protects the interface only. The stored data itself is NOT encrypted,
// so anyone with access to this browser profile and developer tools can read it.

export interface AuthRecord {
  salt: string; // base64
  hash: string; // base64
  iterations: number;
  createdAt: string;
}

const ITERATIONS = 210_000;
const SESSION_KEY = 'smp.unlocked';

function toB64(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

function fromB64(b64: string) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function hashPassword(password: string, salt: Uint8Array, iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return toB64(bits);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function getAuth(): Promise<AuthRecord | undefined> {
  const entry = await db.meta.get('auth');
  return entry?.value as AuthRecord | undefined;
}

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 8) return 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.';
  if (!/[0-9]/.test(pw) || !/[^0-9]/.test(pw)) return 'يجب أن تحتوي كلمة المرور على أرقام وحروف.';
  return null;
}

export async function setPassword(password: string) {
  const err = validatePasswordStrength(password);
  if (err) throw new Error(err);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPassword(password, salt);
  const record: AuthRecord = { salt: toB64(salt), hash, iterations: ITERATIONS, createdAt: new Date().toISOString() };
  await db.meta.put({ key: 'auth', value: record });
}

export async function verifyPassword(password: string): Promise<boolean> {
  const auth = await getAuth();
  if (!auth) return false;
  const hash = await hashPassword(password, fromB64(auth.salt), auth.iterations);
  return timingSafeEqual(hash, auth.hash);
}

export function isUnlocked() {
  return sessionStorage.getItem(SESSION_KEY) === '1';
}

export function markUnlocked(v: boolean) {
  if (v) sessionStorage.setItem(SESSION_KEY, '1');
  else sessionStorage.removeItem(SESSION_KEY);
}
