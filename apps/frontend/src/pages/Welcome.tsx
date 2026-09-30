import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProjectsStore } from '../stores/projects.store';
import { hasRole, useRole } from '../stores/auth.store';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

export default function Welcome() {
  const { t } = useTranslation();
  const { projects, loaded, refresh } = useProjectsStore();
  const canCreate = hasRole(useRole(), 'operator');

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!loaded) {
    return null;
  }

  return (
    <div className="max-w-xl">
      <Card className="p-6">
        <h1 className="text-lg font-semibold text-primary">{t('welcome.title')}</h1>
        <p className="mt-2 text-sm text-muted">
          {projects.length === 0 ? t('welcome.emptyBody') : t('welcome.body')}
        </p>
        <div className="mt-4 flex gap-2">
          {canCreate && (
            <NavLink to="/projects/new">
              <Button type="button">{t('sidebar.addProject')}</Button>
            </NavLink>
          )}
          <NavLink to="/docs">
            <Button type="button" variant="secondary">
              {t('docs.title')}
            </Button>
          </NavLink>
        </div>
      </Card>
    </div>
  );
}
