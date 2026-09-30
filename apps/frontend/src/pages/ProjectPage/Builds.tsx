import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { hasDeploy } from '../../lib/project';
import { socket } from '../../lib/socket';
import { useProjectsStore } from '../../stores/projects.store';
import { hasRole, useRole } from '../../stores/auth.store';
import type { Build, BuildStatus, BuildStep } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge, { BadgeTone } from '../../components/ui/Badge';
import StatusBadge from '../../components/BuildStatusBadge';

const STEP_STATUS_TONE: Record<BuildStep['status'], BadgeTone> = {
  pending: 'muted',
  running: 'accent',
  success: 'success',
  failed: 'danger',
  skipped: 'muted',
};

export default function ProjectBuilds() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const [builds, setBuilds] = useState<Build[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [steps, setSteps] = useState<BuildStep[]>([]);
  const [status, setStatus] = useState<BuildStatus | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logOpen, setLogOpen] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const project = useProjectsStore((s) => s.projects.find((p) => p.id === projectId));
  const canTrigger = hasRole(useRole(), 'operator');
  const [branches, setBranches] = useState<string[]>([]);
  const [branch, setBranch] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);

  // Основная ветка — выбор по умолчанию. Если список веток не загрузился (нет сети
  // до git-хостинга), в селекте остаётся хотя бы она, и обычная сборка работает.
  const defaultBranch = project?.branch ?? '';
  useEffect(() => {
    setBranch(defaultBranch);
    if (!projectId) return;
    api
      .listBranches(projectId)
      .then(setBranches)
      .catch(() => setBranches([]));
  }, [projectId, defaultBranch]);

  const branchOptions = branches.includes(defaultBranch) || !defaultBranch ? branches : [defaultBranch, ...branches];
  const deploySkipped = project != null && hasDeploy(project) && branch !== defaultBranch;

  const loadBuilds = useCallback(async () => {
    if (!projectId) return;
    const list = await api.listBuilds(projectId);
    setBuilds(list);
    return list;
  }, [projectId]);

  useEffect(() => {
    loadBuilds().then((list) => {
      if (list && list.length > 0) {
        setSelectedId(list[0].id);
      }
    });
  }, [loadBuilds]);

  useEffect(() => {
    if (!selectedId) return;

    api.getBuild(selectedId).then((build) => {
      setSteps(build.steps);
      setStatus(build.status);
    });
    setLogLines([]);

    socket.connect();
    socket.emit('subscribe', selectedId);

    const onLog = (line: string) => setLogLines((prev) => [...prev, line]);
    const onSteps = (nextSteps: BuildStep[]) => setSteps(nextSteps);
    const onStatus = (nextStatus: BuildStatus) => setStatus(nextStatus);

    socket.on('log', onLog);
    socket.on('steps', onSteps);
    socket.on('status', onStatus);

    return () => {
      socket.off('log', onLog);
      socket.off('steps', onSteps);
      socket.off('status', onStatus);
    };
  }, [selectedId]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' });
  }, [logLines]);

  async function handleTrigger() {
    if (!projectId) return;
    setTriggering(true);
    setTriggerError(null);
    try {
      const build = await api.triggerBuild(projectId, branch);
      await loadBuilds();
      setSelectedId(build.id);
    } catch (err) {
      setTriggerError((err as Error).message);
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="grid grid-cols-[260px_1fr] gap-5">
      <div>
        {canTrigger && (
          <>
        <label className="mb-2 block text-xs text-muted">
          {t('builds.branch')}
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface-alt px-2 py-1.5 font-mono text-sm text-primary outline-none focus:border-accent"
          >
            {branchOptions.map((name) => (
              <option key={name} value={name}>
                {name === defaultBranch ? `${name} (${t('builds.defaultBranch')})` : name}
              </option>
            ))}
          </select>
        </label>
        {deploySkipped && <p className="mb-2 text-xs text-warning">{t('builds.deploySkipped')}</p>}
        <Button type="button" onClick={handleTrigger} disabled={triggering || !branch} className="mb-3 w-full">
          {t('builds.trigger')}
        </Button>
        {triggerError && <p className="mb-3 text-sm text-danger">{triggerError}</p>}
          </>
        )}
        <ul className="space-y-1.5">
          {builds.map((build) => (
            <li key={build.id}>
              <button
                onClick={() => setSelectedId(build.id)}
                className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                  build.id === selectedId ? 'border-accent bg-surface-alt' : 'border-border hover:bg-surface-alt'
                }`}
              >
                <div className="mb-1 flex justify-between gap-2 font-mono text-xs text-muted">
                  <span>{build.id.slice(0, 8)}</span>
                  <span className="truncate">{build.branch}</span>
                </div>
                <StatusBadge status={build.status} />
              </button>
            </li>
          ))}
          {builds.length === 0 && <p className="px-1 text-sm text-muted">{t('builds.empty')}</p>}
        </ul>
      </div>

      {selectedId && status && (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center gap-4 p-4">
            <StatusBadge status={status} />
            <div className="flex flex-wrap gap-2">
              {steps.map((step) => (
                <Badge key={step.name} tone={STEP_STATUS_TONE[step.status]}>
                  <span className="font-mono">{step.name}</span>
                  {step.durationMs != null && ` · ${(step.durationMs / 1000).toFixed(1)}s`}
                </Badge>
              ))}
            </div>
          </Card>

          <Card>
            <button
              onClick={() => setLogOpen((open) => !open)}
              className="w-full border-b border-border px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted"
            >
              {t('nav.logs')} {logOpen ? '−' : '+'}
            </button>
            {logOpen && (
              <div className="max-h-96 overflow-y-auto bg-surface-alt p-4 font-mono text-xs leading-relaxed text-primary">
                {logLines.length === 0 && <p className="text-muted">{t('builds.logEmpty')}</p>}
                {logLines.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
                <div ref={logEndRef} />
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
