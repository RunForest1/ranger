import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from './ui/Button';
import type { EnvVariableInput } from '../types';

const inputClass =
  'w-full rounded-md border border-border bg-surface-alt px-3 py-2 font-mono text-sm text-primary outline-none focus:border-accent';

// stored — переменная уже сохранена на сервере, её значение клиенту неизвестно.
// Пустое value у такой строки значит «не менять», а не «сделать пустой».
export interface EnvRow {
  key: string;
  value: string;
  stored: boolean;
}

export function storedEnvRows(keys: string[]): EnvRow[] {
  return keys.map((key) => ({ key, value: '', stored: true }));
}

export function envRowsToVariables(rows: EnvRow[]): EnvVariableInput[] {
  return rows
    .filter((row) => row.key.trim())
    .map((row) => (row.stored && !row.value ? { key: row.key } : { key: row.key.trim(), value: row.value }));
}

// Формат обычного .env: KEY=value, комментарии через #, необязательный `export ` и
// кавычки вокруг значения. Многострочные значения не поддерживаются.
function parseDotEnv(text: string): { pairs: { key: string; value: string }[]; badLines: number[] } {
  const pairs: { key: string; value: string }[] = [];
  const badLines: number[] = [];
  text.split('\n').forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const withoutExport = line.replace(/^export\s+/, '');
    const eq = withoutExport.indexOf('=');
    if (eq <= 0) {
      badLines.push(index + 1);
      return;
    }
    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();
    const quote = value[0];
    if (value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }
    pairs.push({ key, value });
  });
  return { pairs, badLines };
}

export default function EnvVariablesEditor({ rows, onChange }: { rows: EnvRow[]; onChange: (rows: EnvRow[]) => void }) {
  const { t } = useTranslation();
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  function updateRow(index: number, patch: Partial<EnvRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function applyImport() {
    const { pairs, badLines } = parseDotEnv(importText);
    if (badLines.length > 0) {
      setImportError(t('projects.env.importBadLines', { lines: badLines.join(', ') }));
      return;
    }
    const next = [...rows];
    for (const { key, value } of pairs) {
      const existing = next.findIndex((row) => row.key === key);
      if (existing >= 0) {
        next[existing] = { ...next[existing], value };
      } else {
        next.push({ key, value, stored: false });
      }
    }
    onChange(next);
    setImportText('');
    setImportError(null);
    setImportOpen(false);
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 && <p className="text-xs text-muted">{t('projects.env.empty')}</p>}
      {rows.map((row, index) => (
        <div key={index} className="flex gap-2">
          <input
            aria-label={t('projects.env.key')}
            placeholder="KEY"
            readOnly={row.stored}
            value={row.key}
            onChange={(e) => updateRow(index, { key: e.target.value })}
            className={`${inputClass} w-2/5 ${row.stored ? 'text-muted' : ''}`}
          />
          <input
            aria-label={t('projects.env.value')}
            placeholder={row.stored ? t('projects.env.keepValue') : t('projects.env.value')}
            value={row.value}
            onChange={(e) => updateRow(index, { value: e.target.value })}
            className={inputClass}
          />
          <Button
            type="button"
            variant="ghost"
            aria-label={t('projects.env.remove')}
            title={t('projects.env.remove')}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            ×
          </Button>
        </div>
      ))}

      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={() => onChange([...rows, { key: '', value: '', stored: false }])}>
          {t('projects.env.add')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setImportOpen((open) => !open)}>
          {t('projects.env.import')}
        </Button>
      </div>

      {importOpen && (
        <div className="space-y-2">
          <textarea
            rows={5}
            placeholder={'API_URL=https://example.com\nSECRET_TOKEN=...'}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-muted">{t('projects.env.importHint')}</p>
          {importError && <p className="text-sm text-danger">{importError}</p>}
          <Button type="button" variant="secondary" onClick={applyImport}>
            {t('projects.env.importApply')}
          </Button>
        </div>
      )}
    </div>
  );
}
