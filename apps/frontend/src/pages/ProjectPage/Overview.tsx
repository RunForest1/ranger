import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { hasRole, useRole } from '../../stores/auth.store';
import type { CommitInfo, Deployment, Project } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';

// На экране — последние деплои, а не вся история проекта (раздел 6 CLAUDE.md).
const HISTORY_LIMIT = 10;

type CommitsState = { status: 'loading' | 'done' | 'error'; commits: CommitInfo[]; error?: string };

function DeploymentCard({ project }: { project: Project }) {
  const { t, i18n } = useTranslation();
  const [deployments, setDeployments] = useState<Deployment[] | null>(null);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const canRollbackAny = hasRole(useRole(), 'operator');

  useEffect(() => {
    api.listDeployments(project.id).then(setDeployments);
  }, [project.id]);

  if (project.containerPort == null || project.hostPort == null) {
    return null;
  }

  const latest = deployments?.[0];
  // Работающая сейчас версия — самый свежий успешный деплой, а не просто первая
  // строка: после неудачного деплоя с автооткатом первой в истории стоит упавшая
  // попытка, а контейнер крутится на образе одной из предыдущих записей.
  const currentId = deployments?.find((d) => d.status === 'running')?.id;
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });

  async function handleRollback(deploymentId: string) {
    setRollbackError(null);
    setRollingBackId(deploymentId);
    try {
      await api.rollbackDeployment(project.id, deploymentId);
      setDeployments(await api.listDeployments(project.id));
    } catch (err) {
      setRollbackError((err as Error).message);
    } finally {
      setRollingBackId(null);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-primary">{t('projects.overview.deployment')}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
        <dt className="text-muted">{t('projects.overview.port')}</dt>
        <dd className="font-mono text-primary">
          {project.hostPort} → {project.containerPort}
        </dd>

        <dt className="text-muted">{t('projects.overview.deploymentStatus')}</dt>
        <dd>
          {!deployments ? (
            <span className="text-muted">{t('projects.overview.commitsLoading')}</span>
          ) : !latest ? (
            <Badge tone="muted">{t('projects.overview.deploymentNone')}</Badge>
          ) : latest.status === 'running' ? (
            <Badge tone="success">{t('projects.overview.deploymentRunning')}</Badge>
          ) : latest.rolledBack ? (
            <Badge tone="warning">{t('projects.overview.deploymentRolledBack')}</Badge>
          ) : (
            <Badge tone="danger">{t('projects.overview.deploymentFailed')}</Badge>
          )}
        </dd>

        {latest && (
          <>
            <dt className="text-muted">{t('projects.overview.deploymentAt')}</dt>
            <dd className="text-primary">{dateFormatter.format(new Date(latest.deployedAt))}</dd>
          </>
        )}
      </dl>

      {deployments && deployments.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {t('projects.overview.deploymentHistory')}
          </h3>
          {rollbackError && <p className="mb-2 text-sm text-danger">{rollbackError}</p>}
          <ul className="space-y-2">
            {deployments.slice(0, HISTORY_LIMIT).map((deployment) => {
              const isCurrent = deployment.id === currentId;
              const canRollback = canRollbackAny && deployment.status === 'running' && !isCurrent;
              return (
                <li key={deployment.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    {isCurrent ? (
                      <Badge tone="muted">{t('projects.overview.rollbackCurrent')}</Badge>
                    ) : deployment.status === 'running' ? (
                      <Badge tone="success">{t('projects.overview.deploymentRunning')}</Badge>
                    ) : deployment.rolledBack ? (
                      <Badge tone="warning">{t('projects.overview.deploymentRolledBack')}</Badge>
                    ) : (
                      <Badge tone="danger">{t('projects.overview.deploymentFailed')}</Badge>
                    )}
                    <span className="font-mono text-xs text-primary">{deployment.buildId.slice(0, 8)}</span>
                    <span className="truncate font-mono text-xs text-muted">
                      {dateFormatter.format(new Date(deployment.deployedAt))}
                    </span>
                  </div>
                  {canRollback && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={rollingBackId !== null}
                      onClick={() => handleRollback(deployment.id)}
                    >
                      {rollingBackId === deployment.id
                        ? t('projects.overview.rollingBack')
                        : t('projects.overview.rollback')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

function CommitsCard({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<CommitsState>({ status: 'loading', commits: [] });

  useEffect(() => {
    setState({ status: 'loading', commits: [] });
    api
      .getCommits(projectId)
      .then((commits) => setState({ status: 'done', commits }))
      .catch((err) => setState({ status: 'error', commits: [], error: (err as Error).message }));
  }, [projectId]);

  const dateFormatter = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-primary">{t('projects.overview.commits')}</h2>
      {state.status === 'loading' && <p className="text-sm text-muted">{t('projects.overview.commitsLoading')}</p>}
      {state.status === 'error' && (
        <p className="text-sm text-danger">
          {t('projects.overview.commitsError')}: {state.error}
        </p>
      )}
      {state.status === 'done' && (
        <ul className="space-y-2.5">
          {state.commits.map((commit) => (
            <li key={commit.hash} className="flex items-baseline gap-3 text-sm">
              <span className="flex-none font-mono text-xs text-muted">{commit.hash.slice(0, 7)}</span>
              <span className="min-w-0 flex-1 truncate text-primary">{commit.message}</span>
              <span className="flex-none whitespace-nowrap text-xs text-muted">
                {commit.author} · {dateFormatter.format(new Date(commit.date))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function ProjectOverview() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    if (projectId) {
      api.getProject(projectId).then(setProject);
    }
  }, [projectId]);

  if (!project) {
    return null;
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="p-5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
          <dt className="text-muted">{t('projects.overview.trigger')}</dt>
          <dd className="text-primary">
            {project.triggerMode === 'cron' ? (
              <span className="font-mono">{project.cronExpr}</span>
            ) : (
              t('projects.new.triggerManual')
            )}
          </dd>

          <dt className="text-muted">{t('projects.overview.installCmd')}</dt>
          <dd className="font-mono text-primary">{project.installCmd || '—'}</dd>

          <dt className="text-muted">{t('projects.overview.testCmd')}</dt>
          <dd className="font-mono text-primary">{project.testCmd || '—'}</dd>

          <dt className="text-muted">{t('projects.overview.buildCmd')}</dt>
          <dd className="font-mono text-primary">{project.buildCmd || '—'}</dd>

          <dt className="text-muted">{t('projects.overview.deployKeyTitle')}</dt>
          <dd>
            {project.deployKey ? (
              <Badge tone="success">{t('projects.overview.deployKeySet')}</Badge>
            ) : (
              <Badge tone="danger">{t('projects.overview.deployKeyMissing')}</Badge>
            )}
          </dd>
        </dl>
      </Card>

      <DeploymentCard project={project} />
      <CommitsCard projectId={project.id} />
    </div>
  );
}
