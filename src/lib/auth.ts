import { db } from '../db/db';

// Local access gate for the director.
// The password is never stored: we keep a PBKDF2-SHA256 hash with a random salt in IndexedDB.
// IMPORTANT: this gate protects the interface only. The stored data itself is NOT encrypted,
// so anyone with access to this browser profile and developer tools can read it.

interface HashedSecret {
  salt: string; // base64
  hash: string; // base64
  iterations: number;
}

export interface AuthRecord extends HashedSecret {
  createdAt: string;
  /** One-time recovery code, hashed like the password. Replaced every time it is used. */
  recovery?: HashedSecret & { createdAt: string };
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

async function hashSecret(secret: string): Promise<HashedSecret> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toB64(salt), hash: await hashPassword(secret, salt), iterations: ITERATIONS };
}

async function matches(secret: string, stored: HashedSecret) {
  return timingSafeEqual(await hashPassword(secret, fromB64(stored.salt), stored.iterations), stored.hash);
}

/** Changing the password keeps the existing recovery code. */
export async function setPassword(password: string) {
  const err = validatePasswordStrength(password);
  if (err) throw new Error(err);
  const previous = await getAuth();
  const record: AuthRecord = { ...(await hashSecret(password)), createdAt: new Date().toISOString(), recovery: previous?.recovery };
  await db.meta.put({ key: 'auth', value: record });
}

export async function verifyPassword(password: string): Promise<boolean> {
  const auth = await getAuth();
  if (!auth) return false;
  return matches(password, auth);
}

// Recovery code: 20 characters from an alphabet without look-alikes (no 0/O, 1/I), about 100 bits.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, so `byte & 31` is unbiased

function normalizeCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Create a new recovery code (invalidating the previous one) and return it for the director to write down. */
export async function createRecoveryCode(): Promise<string> {
  const auth = await getAuth();
  if (!auth) throw new Error('أنشئ كلمة المرور أولًا.');
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => CODE_ALPHABET[b & 31]).join('');
  await db.meta.put({ key: 'auth', value: { ...auth, recovery: { ...(await hashSecret(raw)), createdAt: new Date().toISOString() } } });
  return raw.match(/.{5}/g)!.join('-');
}

export async function hasRecoveryCode() {
  return !!(await getAuth())?.recovery;
}

/**
 * Set a new password using the recovery code. The code is single-use: a fresh one is created
 * and returned. Data is untouched.
 */
export async function resetPasswordWithRecoveryCode(code: string, newPassword: string): Promise<string> {
  const auth = await getAuth();
  if (!auth?.recovery) throw new Error('لم يتم إنشاء رمز استرجاع على هذا الجهاز.');
  if (!(await matches(normalizeCode(code), auth.recovery))) throw new Error('رمز الاسترجاع غير صحيح.');
  await setPassword(newPassword);
  return createRecoveryCode();
}

export function isUnlocked() {
  return sessionStorage.getItem(SESSION_KEY) === '1';
}

export function markUnlocked(v: boolean) {
  if (v) sessionStorage.setItem(SESSION_KEY, '1');
  else sessionStorage.removeItem(SESSION_KEY);
}
