import { Link, Outlet, useParams } from 'react-router-dom';
import { useProjectsStore } from '../../stores/projects.store';
import ProjectActionsMenu from '../../components/ProjectActionsMenu';

// Общая шапка всех страниц проекта: на любой вкладке видно, какой проект открыт,
// и меню действий доступно без возврата на обзор. Проект берётся из стора сайдбара,
// а не отдельным запросом — там уже есть имя и ветка.
export default function ProjectLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProjectsStore((s) => s.projects.find((p) => p.id === projectId));

  if (!projectId) {
    return null;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <div className="min-w-0">
          <Link to={`/projects/${projectId}`} className="text-lg font-semibold text-primary hover:text-accent">
            {project?.name ?? '…'}
          </Link>
          {project && (
            <p className="truncate font-mono text-xs text-muted">
              {project.gitUrl} · {project.branch}
            </p>
          )}
        </div>
        <ProjectActionsMenu projectId={projectId} />
      </div>
      <Outlet />
    </div>
  );
}
