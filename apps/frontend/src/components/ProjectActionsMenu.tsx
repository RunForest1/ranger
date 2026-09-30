import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { hasRole, useRole } from '../stores/auth.store';
import Button from './ui/Button';

export default function ProjectActionsMenu({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const role = useRole();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const base = `/projects/${projectId}`;
  const items = [
    { to: base, label: t('nav.overview') },
    ...(hasRole(role, 'operator') ? [{ to: `${base}/edit`, label: t('projects.overview.edit') }] : []),
    { to: `${base}/builds`, label: t('nav.builds') },
    { to: `${base}/files`, label: t('nav.files') },
    { to: `${base}/metrics`, label: t('nav.metrics') },
    ...(role === 'admin' ? [{ to: `${base}/console`, label: t('nav.console') }] : []),
  ];

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="!flex items-center gap-1.5"
      >
        {t('projects.overview.actions')}
        <ChevronDown size={14} />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-48 rounded-md border border-border bg-surface py-1 shadow-lg"
        >
          {items.map((item) => (
            <NavLink
              key={item.to}
              role="menuitem"
              to={item.to}
              end
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `block border-l-2 px-3 py-2 text-sm hover:bg-surface-alt ${
                  isActive ? 'border-accent text-primary' : 'border-transparent text-muted hover:text-primary'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
