import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

const inputClass =
  'mt-1 w-full rounded-md border border-border bg-surface-alt px-3 py-2 text-primary outline-none focus:border-accent';

// Регистрации нет: учётную запись заводит admin на вкладке «Пользователи»
// и передаёт пароль лично (итерация 5).
export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { t } = useTranslation();
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      setUser(await api.login(email, password));
      onLoggedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <Card className="w-80 p-6">
        <form onSubmit={handleLogin}>
          <h1 className="mb-1 text-lg font-semibold text-primary">{t('app.title')}</h1>
          <p className="mb-4 text-xs text-muted">{t('app.tagline')}</p>
          <label className="mb-3 block text-sm text-muted">
            {t('auth.email')}
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="mb-4 block text-sm text-muted">
            {t('auth.password')}
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </label>
          {error && <p className="mb-3 text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={submitting} className="w-full">
            {t('auth.login')}
          </Button>
          <p className="mt-3 text-center text-xs text-muted">{t('auth.noAccount')}</p>
        </form>
      </Card>
    </div>
  );
}
