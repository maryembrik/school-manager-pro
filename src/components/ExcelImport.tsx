import { useRef } from 'react';
import { Download, Upload } from 'lucide-react';
import { Button } from './ui';

/** "Template" + "Import Excel" toolbar buttons used by the students, teachers and classes lists. */
export function ExcelImportButtons({ onFile, onTemplate }: { onFile: (f: File) => void; onTemplate: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      <Button variant="ghost" onClick={onTemplate} title="تحميل نموذج Excel للاستيراد">
        <Download className="h-4 w-4" /> نموذج
      </Button>
      <Button variant="secondary" onClick={() => fileRef.current?.click()}>
        <Upload className="h-4 w-4" /> استيراد Excel
      </Button>
    </>
  );
}
