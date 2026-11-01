import { db, DATA_TABLES, type DataTableName } from '../db/db';
import { logActivity } from '../db/repo';
import { loadSettings, sanitizeSettings, saveSettings, type AppSettings } from './settings';

export const BACKUP_APP_ID = 'school-manager-pro';
export const BACKUP_VERSION = 1;

export interface BackupFileEntry {
  id: number;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  data: string; // base64
}

export interface BackupPayload {
  app: typeof BACKUP_APP_ID;
  version: number;
  exportedAt: string;
  settings: AppSettings;
  logo: string | null;
  tables: Record<DataTableName, Record<string, unknown>[]>;
  files: BackupFileEntry[] | null;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) s += String.fromCharCode(...buf.subarray(i, i + chunk));
  return btoa(s);
}

function base64ToBlob(b64: string, type: string) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return new Blob([out], { type });
}

export async function createBackup(includeFiles: boolean): Promise<BackupPayload> {
  const tables = {} as BackupPayload['tables'];
  for (const name of DATA_TABLES) {
    tables[name] = (await db.table(name).toArray()) as Record<string, unknown>[];
  }
  let files: BackupFileEntry[] | null = null;
  if (includeFiles) {
    files = [];
    for (const f of await db.files.toArray()) {
      files.push({ id: f.id!, name: f.name, type: f.type, size: f.size, createdAt: f.createdAt, data: await blobToBase64(f.blob) });
    }
  }
  const logo = ((await db.meta.get('logo'))?.value as string | undefined) ?? null;
  return {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: loadSettings(),
    logo,
    tables,
    files,
  };
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  summary: Partial<Record<DataTableName, number>>;
  fileCount: number;
}

/** Check the structure of a parsed backup before anything is written. */
export function validateBackup(data: unknown): ValidationResult {
  const errors: string[] = [];
  const summary: ValidationResult['summary'] = {};
  if (!data || typeof data !== 'object') {
    return { ok: false, errors: ['الملف لا يحتوي على بيانات صالحة.'], summary, fileCount: 0 };
  }
  const d = data as Partial<BackupPayload>;
  if (d.app !== BACKUP_APP_ID) errors.push('الملف ليس نسخة احتياطية من School Manager Pro.');
  if (typeof d.version !== 'number' || d.version > BACKUP_VERSION) errors.push('إصدار النسخة الاحتياطية غير مدعوم.');
  if (!d.tables || typeof d.tables !== 'object') {
    errors.push('جداول البيانات مفقودة.');
  } else {
    for (const name of DATA_TABLES) {
      const rows = (d.tables as Record<string, unknown>)[name];
      if (rows === undefined) continue;
      if (!Array.isArray(rows)) {
        errors.push(`الجدول "${name}" ليس قائمة.`);
        continue;
      }
      const bad = rows.findIndex(
        (r) => !r || typeof r !== 'object' || Array.isArray(r) || (r as { id?: unknown }).id === undefined || typeof (r as { id?: unknown }).id !== 'number',
      );
      if (bad >= 0) errors.push(`سجل غير صالح في الجدول "${name}" (السطر ${bad + 1}).`);
      summary[name] = rows.length;
    }
  }
  let fileCount = 0;
  if (d.files !== undefined && d.files !== null) {
    if (!Array.isArray(d.files)) errors.push('قائمة الملفات المرفقة غير صالحة.');
    else {
      fileCount = d.files.length;
      const bad = d.files.findIndex((f) => !f || typeof f.id !== 'number' || typeof f.data !== 'string' || typeof f.name !== 'string');
      if (bad >= 0) errors.push(`ملف مرفق غير صالح (رقم ${bad + 1}).`);
    }
  }
  if (d.logo !== undefined && d.logo !== null && (typeof d.logo !== 'string' || !d.logo.startsWith('data:image/'))) {
    errors.push('شعار المؤسسة في النسخة غير صالح.');
  }
  return { ok: errors.length === 0, errors, summary, fileCount };
}

/**
 * Replace all local data with the backup content. Runs in a single transaction:
 * if anything fails, IndexedDB rolls back and the current data is kept intact.
 */
export async function restoreBackup(data: BackupPayload) {
  const v = validateBackup(data);
  if (!v.ok) throw new Error(v.errors.join('\n'));
  const tables = [...DATA_TABLES.map((n) => db.table(n)), db.files, db.meta];
  await db.transaction('rw', tables, async () => {
    for (const name of DATA_TABLES) {
      await db.table(name).clear();
      const rows = data.tables[name];
      if (rows?.length) await db.table(name).bulkAdd(rows);
    }
    if (data.files) {
      await db.files.clear();
      await db.files.bulkAdd(
        data.files.map((f) => ({ id: f.id, name: f.name, type: f.type, size: f.size, createdAt: f.createdAt, blob: base64ToBlob(f.data, f.type) })),
      );
    }
    if (data.logo) await db.meta.put({ key: 'logo', value: data.logo });
    else await db.meta.delete('logo');
  });
  saveSettings(sanitizeSettings(data.settings));
  await logActivity('استيراد', 'نسخة احتياطية', `استعادة نسخة بتاريخ ${data.exportedAt?.slice(0, 10) ?? ''}`);
}

/** Delete every record (used from Settings, after confirmation). The password is kept. */
export async function wipeAllData() {
  await db.transaction('rw', [...DATA_TABLES.map((n) => db.table(n)), db.files], async () => {
    for (const name of DATA_TABLES) await db.table(name).clear();
    await db.files.clear();
  });
}

export function downloadJson(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  downloadBlob(blob, filename);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
