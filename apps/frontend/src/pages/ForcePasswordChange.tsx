import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import ChangePasswordForm from '../components/ChangePasswordForm';

export default function ForcePasswordChange() {
  const { t } = useTranslation();
  const email = useAuthStore((s) => s.user?.email);
  const markPasswordChanged = useAuthStore((s) => s.markPasswordChanged);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <Card className="w-96 space-y-4 p-6">
        <div>
          <h1 className="text-lg font-semibold text-primary">{t('account.forceTitle')}</h1>
          <p className="mt-1 text-sm text-muted">{t('account.forceHint', { email })}</p>
        </div>
        <ChangePasswordForm onChanged={markPasswordChanged} />
        <Button
          type="button"
          variant="ghost"
          onClick={() => api.logout().then(() => window.location.reload())}
          className="w-full"
        >
          {t('auth.logout')}
        </Button>
      </Card>
    </div>
  );
}
