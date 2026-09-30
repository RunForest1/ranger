import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { BookOpen, Container, KeyRound, LogOut, ScrollText, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useRole } from '../stores/auth.store';
import Button from './ui/Button';
import ThemeToggle from './ThemeToggle';
import LanguageToggle from './LanguageToggle';

export default function Header() {
  const { t } = useTranslation();
  const role = useRole();

  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-surface px-4">
      <NavLink to="/" className="font-semibold text-primary">
        {t('app.title')}
      </NavLink>
      <div className="flex items-center gap-2 text-sm">
        <NavLink to="/containers" title={t('containers.title')} aria-label={t('containers.title')}>
          {({ isActive }) => (
            <Button type="button" variant={isActive ? 'secondary' : 'ghost'} className="!px-2 !py-1.5">
              <Container size={16} />
            </Button>
          )}
        </NavLink>
        {role === 'admin' && (
          <>
            <NavLink to="/users" title={t('users.title')} aria-label={t('users.title')}>
              {({ isActive }) => (
                <Button type="button" variant={isActive ? 'secondary' : 'ghost'} className="!px-2 !py-1.5">
                  <Users size={16} />
                </Button>
              )}
            </NavLink>
            <NavLink to="/audit-log" title={t('auditLog.title')} aria-label={t('auditLog.title')}>
              {({ isActive }) => (
                <Button type="button" variant={isActive ? 'secondary' : 'ghost'} className="!px-2 !py-1.5">
                  <ScrollText size={16} />
                </Button>
              )}
            </NavLink>
          </>
        )}
        <NavLink to="/docs" title={t('docs.title')} aria-label={t('docs.title')}>
          {({ isActive }) => (
            <Button type="button" variant={isActive ? 'secondary' : 'ghost'} className="!px-2 !py-1.5">
              <BookOpen size={16} />
            </Button>
          )}
        </NavLink>
        <LanguageToggle />
        <ThemeToggle />
        <NavLink to="/account" title={t('account.title')} aria-label={t('account.title')}>
          {({ isActive }) => (
            <Button type="button" variant={isActive ? 'secondary' : 'ghost'} className="!px-2 !py-1.5">
              <KeyRound size={16} />
            </Button>
          )}
        </NavLink>
        <Button
          type="button"
          variant="ghost"
          onClick={() => api.logout().then(() => window.location.reload())}
          title={t('auth.logout')}
          className="!flex !items-center !gap-1.5 !px-2 !py-1.5"
        >
          <LogOut size={16} />
        </Button>
      </div>
    </header>
  );
}
