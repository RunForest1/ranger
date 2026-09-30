import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import type { PublicStatusEntry } from '../types';
import Card from '../components/ui/Card';
import BuildStatusBadge from '../components/BuildStatusBadge';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';

const REFRESH_INTERVAL_MS = 30_000;

type State = { status: 'loading' | 'done' | 'error'; entries: PublicStatusEntry[] };

// Публичная страница без логина (итерация 5) — поэтому без шапки и сайдбара
// приложения, со своими переключателями темы и языка.
export default function Status() {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<State>({ status: 'loading', entries: [] });

  useEffect(() => {
    const load = () =>
      api
        .getPublicStatus()
        .then((entries) => setState({ status: 'done', entries }))
        .catch(() => setState((prev) => ({ ...prev, status: prev.entries.length ? 'done' : 'error' })));
    load();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const dateFormatter = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="min-h-screen bg-bg px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-primary">{t('status.title')}</h1>
            <p className="mt-1 text-sm text-muted">{t('status.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>

        <Card className="divide-y divide-border">
          {state.status === 'loading' && <p className="p-5 text-sm text-muted">{t('status.loading')}</p>}
          {state.status === 'error' && <p className="p-5 text-sm text-danger">{t('status.error')}</p>}
          {state.status === 'done' && state.entries.length === 0 && (
            <p className="p-5 text-sm text-muted">{t('status.empty')}</p>
          )}
          {state.status === 'done' &&
            state.entries.map((entry) => (
              <div key={entry.name} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span className="min-w-0 truncate text-primary">{entry.name}</span>
                <div className="flex flex-none items-center gap-3">
                  {entry.at && (
                    <span className="font-mono text-xs text-muted">{dateFormatter.format(new Date(entry.at))}</span>
                  )}
                  {entry.status ? (
                    <BuildStatusBadge status={entry.status} />
                  ) : (
                    <span className="text-xs text-muted">{t('status.noBuilds')}</span>
                  )}
                </div>
              </div>
            ))}
        </Card>
      </div>
    </div>
  );
}
