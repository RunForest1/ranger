import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useRole } from '../stores/auth.store';
import type { AuditLogEntry } from '../types';
import Card from '../components/ui/Card';

type State = { status: 'loading' | 'done' | 'error' | 'forbidden'; entries: AuditLogEntry[] };

export default function AuditLog() {
  const { t, i18n } = useTranslation();
  const role = useRole();
  const [state, setState] = useState<State>({ status: 'loading', entries: [] });

  useEffect(() => {
    if (role !== 'admin') {
      setState({ status: 'forbidden', entries: [] });
      return;
    }
    api
      .listAuditLog()
      .then((entries) => setState({ status: 'done', entries }))
      .catch(() => setState({ status: 'error', entries: [] }));
  }, [role]);

  const dateFormatter = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'medium' });

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-primary">{t('auditLog.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('auditLog.subtitle')}</p>
      </div>

      <Card className="divide-y divide-border">
        {state.status === 'forbidden' && <p className="p-5 text-sm text-muted">{t('auditLog.forbidden')}</p>}
        {state.status === 'loading' && <p className="p-5 text-sm text-muted">{t('auditLog.loading')}</p>}
        {state.status === 'error' && <p className="p-5 text-sm text-danger">{t('auditLog.error')}</p>}
        {state.status === 'done' && state.entries.length === 0 && (
          <p className="p-5 text-sm text-muted">{t('auditLog.empty')}</p>
        )}
        {state.status === 'done' &&
          state.entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
              <div className="min-w-0">
                <span className="text-primary">{t(`auditLog.actions.${entry.action}`, entry.action)}</span>
                <span className="ml-2 truncate font-mono text-xs text-muted">{entry.target}</span>
              </div>
              <div className="flex flex-none items-center gap-3 text-xs text-muted">
                <span>{entry.userEmail}</span>
                <span className="font-mono">{dateFormatter.format(new Date(entry.createdAt))}</span>
              </div>
            </div>
          ))}
      </Card>
    </div>
  );
}
