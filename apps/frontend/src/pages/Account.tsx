import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/auth.store';
import Card from '../components/ui/Card';
import ChangePasswordForm from '../components/ChangePasswordForm';

export default function Account() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  return (
    <div className="max-w-sm">
      <h1 className="mb-1 text-lg font-semibold text-primary">{t('account.title')}</h1>
      {user && (
        <p className="mb-4 text-sm text-muted">
          {user.email} · <span className="font-mono">{t(`users.roles.${user.role}`)}</span>
        </p>
      )}
      <Card className="p-5">
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
