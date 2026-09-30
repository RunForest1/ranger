import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { File, Folder } from 'lucide-react';
import { api } from '../../lib/api';
import { formatBytes } from '../../lib/format';
import type { FileContent, FileEntry } from '../../types';
import Card from '../../components/ui/Card';

export default function ProjectFiles() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<FileContent | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setEntries(null);
    setError(null);
    setSelectedFile(null);
    setFileContent(null);
    api
      .listFiles(projectId, currentPath)
      .then(setEntries)
      .catch((err) => setError((err as Error).message));
  }, [projectId, currentPath]);

  useEffect(() => {
    if (!projectId || !selectedFile) return;
    setFileContent(null);
    api.readFile(projectId, selectedFile).then(setFileContent);
  }, [projectId, selectedFile]);

  const breadcrumbs = currentPath ? currentPath.split('/') : [];

  return (
    <div className="grid grid-cols-[320px_1fr] gap-5">
      <div>
        <h1 className="mb-3 text-lg font-semibold text-primary">{t('files.title')}</h1>

        <div className="mb-3 flex flex-wrap items-center gap-1 font-mono text-xs text-muted">
          <button onClick={() => setCurrentPath('')} className="hover:text-accent">
            /
          </button>
          {breadcrumbs.map((segment, i) => (
            <span key={i} className="flex items-center gap-1">
              <span>/</span>
              <button onClick={() => setCurrentPath(breadcrumbs.slice(0, i + 1).join('/'))} className="hover:text-accent">
                {segment}
              </button>
            </span>
          ))}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        {!error && !entries && <p className="text-sm text-muted">{t('files.loading')}</p>}
        {entries && (
          <ul className="space-y-1">
            {entries.length === 0 && <p className="px-1 text-sm text-muted">{t('files.empty')}</p>}
            {entries.map((entry) => {
              const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
              return (
                <li key={entry.name}>
                  <button
                    onClick={() => (entry.type === 'dir' ? setCurrentPath(entryPath) : setSelectedFile(entryPath))}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-1.5 text-left text-sm transition-colors ${
                      entryPath === selectedFile ? 'border-accent bg-surface-alt' : 'border-border hover:bg-surface-alt'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5 truncate text-primary">
                      {entry.type === 'dir' ? (
                        <Folder size={14} className="flex-none text-muted" />
                      ) : (
                        <File size={14} className="flex-none text-muted" />
                      )}
                      <span className="truncate">{entry.name}</span>
                    </span>
                    {entry.type === 'file' && <span className="flex-none font-mono text-xs text-muted">{formatBytes(entry.size)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectedFile && (
        <Card>
          <div className="border-b border-border px-4 py-2.5 font-mono text-xs text-muted">{selectedFile}</div>
          <div className="max-h-[36rem] overflow-auto p-4">
            {!fileContent && <p className="text-sm text-muted">{t('files.loading')}</p>}
            {fileContent?.tooLarge && <p className="text-sm text-muted">{t('files.tooLarge')}</p>}
            {fileContent?.binary && <p className="text-sm text-muted">{t('files.binary')}</p>}
            {fileContent && !fileContent.tooLarge && !fileContent.binary && (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-primary">
                {fileContent.content}
              </pre>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
