import * as XLSX from 'xlsx';
import { downloadBlob } from './backup';

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

/** Export rows to an .xlsx file with a right-to-left sheet. */
export function exportExcel<T>(rows: T[], columns: ExportColumn<T>[], filename: string, sheetName = 'البيانات') {
  const data = [columns.map((c) => c.header), ...rows.map((r) => columns.map((c) => c.value(r) ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = columns.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

/** Export several tables as separate sheets of one workbook. */
export function exportExcelSheets(sheets: { name: string; rows: (string | number)[][] }[], filename: string) {
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  const used = new Set<string>();
  sheets.forEach((s, i) => {
    let name = s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || `ورقة ${i + 1}`;
    if (used.has(name)) name = `${name.slice(0, 25)} ${i + 1}`;
    used.add(name);
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    ws['!cols'] = (s.rows[0] ?? []).map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

/** Read the first sheet of an Excel/CSV file as objects keyed by header. */
export async function readSpreadsheet(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export interface PrintHeader {
  schoolName: string;
  schoolYear: string;
  logo?: string | null;
}

/**
 * Open a print view (Arabic, RTL). PDF export goes through the browser's "Save as PDF"
 * destination, which renders Arabic shaping correctly — something client-side PDF
 * libraries do not handle without extra font and shaping work.
 */
export function printHtml(title: string, bodyHtml: string, header: PrintHeader) {
  const w = window.open('', '_blank');
  if (!w) {
    throw new Error('تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع.');
  }
  const logo = header.logo?.startsWith('data:image/') ? `<img src="${escapeHtml(header.logo)}" style="height:60px" />` : '';
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet">
<style>
  body{font-family:Cairo,Tahoma,sans-serif;color:#111;margin:24px;font-size:13px}
  header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1e3a8a;padding-bottom:8px;margin-bottom:16px}
  h1{font-size:20px;text-align:center;margin:12px 0;color:#1e3a8a}
  h2{font-size:15px;margin:16px 0 6px;color:#1e3a8a}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  th,td{border:1px solid #999;padding:4px 6px;text-align:right;vertical-align:top}
  th{background:#e8edf7}
  .muted{color:#555}
  .sig{margin-top:48px;display:flex;justify-content:space-between}
  .box{border:1px solid #999;padding:8px;min-height:40px;white-space:pre-wrap}
  @media print{button{display:none}}
</style></head><body>
<header><div><strong>${escapeHtml(header.schoolName)}</strong><br><span class="muted">السنة الدراسية ${escapeHtml(header.schoolYear)}</span></div>${logo}</header>
<h1>${escapeHtml(title)}</h1>
${bodyHtml}
<p class="muted" style="margin-top:24px;font-size:11px">طُبع بتاريخ ${new Date().toLocaleDateString('ar-TN')}</p>
<button onclick="window.print()" style="position:fixed;top:8px;left:8px;padding:6px 14px">طباعة / حفظ PDF</button>
</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 600);
}

export { escapeHtml };

/** Build a simple HTML table for print views. */
export function htmlTable<T>(rows: T[], columns: ExportColumn<T>[]) {
  const head = columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${columns.map((c) => `<td>${escapeHtml(String(c.value(r) ?? ''))}</td>`).join('')}</tr>`)
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length}">لا توجد بيانات</td></tr>`}</tbody></table>`;
}
