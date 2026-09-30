import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';
import type { AppUser, UserRole } from '../types';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';

const ROLES: UserRole[] = ['admin', 'operator', 'viewer'];
const inputClass =
  'rounded-md border border-border bg-surface-alt px-3 py-2 text-sm text-primary outline-none focus:border-accent';

// Сгенерированный пароль показывается один раз — в базе только хэш, повторно его
// не получить, только сбросить заново.
function IssuedPassword({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Card className="space-y-2 border-accent p-4">
      <p className="text-sm text-primary">{t('users.issued', { email })}</p>
      <div className="flex items-center gap-2">
        <code className="rounded-md bg-surface-alt px-3 py-1.5 font-mono text-sm text-primary">{password}</code>
        <Button type="button" variant="secondary" onClick={() => navigator.clipboard?.writeText(password)}>
          {t('users.copy')}
        </Button>
      </div>
      <p className="text-xs text-muted">{t('users.issuedHint')}</p>
      <Button type="button" variant="ghost" onClick={onClose}>
        {t('users.issuedDone')}
      </Button>
    </Card>
  );
}

export default function Users() {
  const { t, i18n } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('operator');
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isAdmin = me?.role === 'admin';

  useEffect(() => {
    if (isAdmin) {
      api.listUsers().then(setUsers);
    }
  }, [isAdmin]);

  if (!isAdmin) {
    return <p className="text-sm text-muted">{t('users.forbidden')}</p>;
  }

  const dateFormatter = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });

  // Одна обёртка для всех действий над строкой: блокирует кнопки на время запроса
  // и показывает ошибку бэкенда, а список всегда перечитывается с сервера.
  async function run(id: string | null, action: () => Promise<void>) {
    setError(null);
    setBusyId(id);
    try {
      await action();
      setUsers(await api.listUsers());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    run(null, async () => {
      const result = await api.createUser(email, role);
      setIssued({ email: result.user.email, password: result.password });
      setEmail('');
    });
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-primary">{t('users.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('users.subtitle')}</p>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-primary">{t('users.create')}</h2>
        <form onSubmit={handleCreate} className="flex flex-wrap items-center gap-2">
          <input
            type="email"
            required
            placeholder={t('auth.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${inputClass} min-w-0 flex-1`}
          />
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={inputClass}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`users.roles.${r}`)}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={busyId !== null}>
            {t('users.createSubmit')}
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted">{t('users.rolesHint')}</p>
      </Card>

      {issued && <IssuedPassword {...issued} onClose={() => setIssued(null)} />}
      {error && <p className="text-sm text-danger">{error}</p>}

      <Card className="divide-y divide-border">
        {users.map((user) => {
          const isSelf = user.id === me?.id;
          const busy = busyId === user.id;
          return (
            <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-primary">{user.email}</span>
                  {isSelf && <span className="text-xs text-muted">{t('users.you')}</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {user.disabled ? (
                    <Badge tone="danger">{t('users.disabled')}</Badge>
                  ) : user.mustChangePassword ? (
                    <Badge tone="warning">{t('users.pendingPassword')}</Badge>
                  ) : (
                    <Badge tone="success">{t('users.active')}</Badge>
                  )}
                  <span className="font-mono text-xs text-muted">{dateFormatter.format(new Date(user.createdAt))}</span>
                </div>
              </div>

              {isSelf ? (
                <span className="font-mono text-xs text-muted">{t(`users.roles.${user.role}`)}</span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={user.role}
                    disabled={busy}
                    onChange={(e) =>
                      run(user.id, async () => {
                        await api.updateUser(user.id, { role: e.target.value as UserRole });
                      })
                    }
                    className={`${inputClass} !py-1.5`}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`users.roles.${r}`)}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      run(user.id, async () => {
                        const result = await api.resetUserPassword(user.id);
                        setIssued({ email: result.user.email, password: result.password });
                      })
                    }
                  >
                    {t('users.resetPassword')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      run(user.id, async () => {
                        await api.updateUser(user.id, { disabled: !user.disabled });
                      })
                    }
                  >
                    {user.disabled ? t('users.enable') : t('users.disable')}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
