import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProjectsStore } from '../stores/projects.store';
import { hasRole, useRole } from '../stores/auth.store';

export default function Sidebar() {
  const { t } = useTranslation();
  const { projects, refresh } = useProjectsStore();
  const canCreate = hasRole(useRole(), 'operator');

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <aside className="flex w-60 flex-col border-r border-border bg-surface">
      <div className="px-3 py-3 text-xs font-medium uppercase tracking-wide text-muted">{t('sidebar.projects')}</div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {projects.length === 0 && <p className="px-2 py-2 text-sm text-muted">{t('sidebar.noProjects')}</p>}
        {projects.map((project) => (
          <NavLink
            key={project.id}
            to={`/projects/${project.id}`}
            className={({ isActive }) =>
              `block rounded-md border-l-2 px-2.5 py-2 text-sm transition-colors ${
                isActive
                  ? 'border-accent bg-surface-alt text-primary'
                  : 'border-transparent text-muted hover:bg-surface-alt hover:text-primary'
              }`
            }
          >
            <div className="truncate">{project.name}</div>
            <div className="truncate font-mono text-xs text-muted">{project.branch}</div>
          </NavLink>
        ))}
      </nav>
      {canCreate && (
        <NavLink
          to="/projects/new"
          className="m-2 rounded-md border border-dashed border-border px-2.5 py-2 text-center text-sm text-accent hover:border-accent"
        >
          + {t('sidebar.addProject')}
        </NavLink>
      )}
    </aside>
  );
}
