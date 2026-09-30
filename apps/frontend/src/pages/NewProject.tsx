import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useProjectsStore } from '../stores/projects.store';
import { hasRole, useRole } from '../stores/auth.store';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import EnvVariablesEditor, { EnvRow, envRowsToVariables } from '../components/EnvVariablesEditor';

const inputClass =
  'mt-1 w-full rounded-md border border-border bg-surface-alt px-3 py-2 text-primary outline-none focus:border-accent';
const labelClass = 'block text-sm font-medium text-primary';
const hintClass = 'mt-1 text-xs text-muted';

type BranchState = { status: 'idle' | 'checking' | 'done' | 'error'; branches: string[]; error?: string };

const PRESETS = {
  custom: { install: '', test: '', build: '' },
  npm: { install: 'npm install', test: 'npm test', build: 'npm run build' },
  bun: { install: 'bun install', test: 'bun test', build: 'bun run build' },
  python: { install: 'pip install -r requirements.txt', test: 'pytest', build: '' },
} as const;
type PresetKey = keyof typeof PRESETS;

export default function NewProject() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const refreshProjects = useProjectsStore((s) => s.refresh);
  const canCreate = hasRole(useRole(), 'operator');
  const [name, setName] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [deployPrivateKey, setDeployPrivateKey] = useState('');
  const [branchState, setBranchState] = useState<BranchState>({ status: 'idle', branches: [] });
  const [preset, setPreset] = useState<PresetKey>('custom');
  const [installCmd, setInstallCmd] = useState('');
  const [testCmd, setTestCmd] = useState('');
  const [buildCmd, setBuildCmd] = useState('');
  const [triggerMode, setTriggerMode] = useState<'manual' | 'cron'>('manual');
  const [cronExpr, setCronExpr] = useState('');
  const [autoBuild, setAutoBuild] = useState(true);
  const [deployOpen, setDeployOpen] = useState(false);
  const [containerPort, setContainerPort] = useState('');
  const [hostPort, setHostPort] = useState('');
  const [envOpen, setEnvOpen] = useState(false);
  const [envRows, setEnvRows] = useState<EnvRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canCheckRepository = gitUrl.trim().length > 0 && deployPrivateKey.trim().length > 0;

  async function handleCheckRepository() {
    setBranchState({ status: 'checking', branches: [] });
    try {
      const { branches } = await api.checkRepository(gitUrl, deployPrivateKey);
      setBranchState({ status: 'done', branches });
      if (branches.length > 0) {
        const preferred = branches.find((b) => b === 'main' || b === 'master') ?? branches[0];
        setBranch(preferred);
      }
    } catch (err) {
      setBranchState({ status: 'error', branches: [], error: (err as Error).message });
    }
  }

  function applyPreset(key: PresetKey) {
    setPreset(key);
    const values = PRESETS[key];
    setInstallCmd(values.install);
    setTestCmd(values.test);
    setBuildCmd(values.build);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!installCmd.trim() && !testCmd.trim() && !buildCmd.trim()) {
      setError(t('projects.new.needCommand'));
      return;
    }
    if (deployOpen && (!containerPort.trim() || !hostPort.trim())) {
      setError(t('projects.new.deployPortsRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const project = await api.createProject({
        name,
        gitUrl,
        branch,
        deployPrivateKey,
        installCmd: installCmd || undefined,
        testCmd: testCmd || undefined,
        buildCmd: buildCmd || undefined,
        triggerMode,
        cronExpr: triggerMode === 'cron' ? cronExpr : undefined,
        containerPort: deployOpen && containerPort ? Number(containerPort) : undefined,
        hostPort: deployOpen && hostPort ? Number(hostPort) : undefined,
        env: envRowsToVariables(envRows),
      });
      await refreshProjects();
      if (autoBuild) {
        await api.triggerBuild(project.id, project.branch);
        navigate(`/projects/${project.id}/builds`);
      } else {
        navigate(`/projects/${project.id}`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!canCreate) {
    return <p className="text-sm text-muted">{t('users.forbidden')}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      <h1 className="text-lg font-semibold text-primary">{t('projects.new.title')}</h1>

      <Card className="space-y-4 p-5">
        <label className={labelClass}>
          {t('projects.new.name')}
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>

        <label className={labelClass}>
          {t('projects.new.gitUrl')}
          <input
            required
            placeholder="git@github.com:owner/repo.git"
            value={gitUrl}
            onChange={(e) => {
              setGitUrl(e.target.value);
              setBranchState({ status: 'idle', branches: [] });
            }}
            className={`${inputClass} font-mono`}
          />
        </label>

        <label className={labelClass}>
          {t('projects.new.deployKey')}
          <textarea
            required
            rows={4}
            value={deployPrivateKey}
            onChange={(e) => {
              setDeployPrivateKey(e.target.value);
              setBranchState({ status: 'idle', branches: [] });
            }}
            className={`${inputClass} font-mono`}
          />
          <span className={hintClass}>{t('projects.new.deployKeyHint')}</span>
        </label>

        <div>
          <div className="flex items-center justify-between">
            <span className={labelClass}>{t('projects.new.branch')}</span>
            <Button
              type="button"
              variant="secondary"
              disabled={!canCheckRepository || branchState.status === 'checking'}
              onClick={handleCheckRepository}
              className="!px-2 !py-1 text-xs"
            >
              {branchState.status === 'checking' ? t('projects.new.checking') : t('projects.new.checkRepository')}
            </Button>
          </div>

          {branchState.status === 'done' && branchState.branches.length > 0 ? (
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className={`${inputClass} font-mono`}>
              {branchState.branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          ) : (
            <input value={branch} onChange={(e) => setBranch(e.target.value)} className={`${inputClass} font-mono`} />
          )}

          {branchState.status === 'done' && (
            <p className="mt-1.5">
              <Badge tone="success">
                {t('projects.new.checkSuccess', { count: branchState.branches.length })}
              </Badge>
            </p>
          )}
          {branchState.status === 'error' && (
            <p className="mt-1 text-xs text-danger">
              {t('projects.new.checkFailed')}: {branchState.error}
            </p>
          )}
          {branchState.status === 'idle' && <p className={hintClass}>{t('projects.new.branchHint')}</p>}
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary">{t('projects.new.commandsTitle')}</h2>
          <select
            value={preset}
            onChange={(e) => applyPreset(e.target.value as PresetKey)}
            className="rounded-md border border-border bg-surface-alt px-2 py-1 text-xs text-primary"
          >
            <option value="custom">{t('projects.new.presets.custom')}</option>
            <option value="npm">{t('projects.new.presets.npm')}</option>
            <option value="bun">{t('projects.new.presets.bun')}</option>
            <option value="python">{t('projects.new.presets.python')}</option>
          </select>
        </div>
        <label className={labelClass}>
          {t('projects.new.installCmd')}
          <input value={installCmd} onChange={(e) => setInstallCmd(e.target.value)} className={`${inputClass} font-mono`} />
        </label>
        <label className={labelClass}>
          {t('projects.new.testCmd')}
          <input value={testCmd} onChange={(e) => setTestCmd(e.target.value)} className={`${inputClass} font-mono`} />
        </label>
        <label className={labelClass}>
          {t('projects.new.buildCmd')}
          <input value={buildCmd} onChange={(e) => setBuildCmd(e.target.value)} className={`${inputClass} font-mono`} />
        </label>
        <p className={hintClass}>{t('projects.new.commandsHint')}</p>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-primary">{t('projects.new.trigger')}</h2>
        <label className="mr-4 text-sm text-primary">
          <input
            type="radio"
            checked={triggerMode === 'manual'}
            onChange={() => setTriggerMode('manual')}
            className="mr-1"
          />
          {t('projects.new.triggerManual')}
        </label>
        <label className="text-sm text-primary">
          <input type="radio" checked={triggerMode === 'cron'} onChange={() => setTriggerMode('cron')} className="mr-1" />
          {t('projects.new.triggerCron')}
        </label>
        {triggerMode === 'cron' && (
          <input
            required
            placeholder="*/30 * * * *"
            value={cronExpr}
            onChange={(e) => setCronExpr(e.target.value)}
            className={`${inputClass} font-mono`}
          />
        )}
        <label className="mt-3 flex items-center gap-2 text-sm text-primary">
          <input type="checkbox" checked={autoBuild} onChange={(e) => setAutoBuild(e.target.checked)} />
          {t('projects.new.autoBuild')}
        </label>
      </Card>

      <Card className="p-5">
        <button
          type="button"
          onClick={() => setDeployOpen((open) => !open)}
          className="flex w-full items-center justify-between text-left text-sm font-semibold text-primary"
        >
          {t('projects.new.deployTitle')}
          <span className="text-xs font-normal text-muted">{deployOpen ? '−' : '+'}</span>
        </button>
        {deployOpen && (
          <div className="mt-4 space-y-4">
            <p className={hintClass}>{t('projects.new.deployHint')}</p>
            <div className="grid grid-cols-2 gap-4">
              <label className={labelClass}>
                {t('projects.new.containerPort')}
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={containerPort}
                  onChange={(e) => setContainerPort(e.target.value)}
                  className={`${inputClass} font-mono`}
                />
              </label>
              <label className={labelClass}>
                {t('projects.new.hostPort')}
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={hostPort}
                  onChange={(e) => setHostPort(e.target.value)}
                  className={`${inputClass} font-mono`}
                />
              </label>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <button
          type="button"
          onClick={() => setEnvOpen((open) => !open)}
          className="flex w-full items-center justify-between text-left text-sm font-semibold text-primary"
        >
          {t('projects.env.title')}
          <span className="text-xs font-normal text-muted">{envOpen ? '−' : '+'}</span>
        </button>
        {envOpen && (
          <div className="mt-4 space-y-3">
            <p className={hintClass}>{t('projects.env.hint')}</p>
            <EnvVariablesEditor rows={envRows} onChange={setEnvRows} />
          </div>
        )}
      </Card>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={submitting}>
        {t('projects.new.submit')}
      </Button>
    </form>
  );
}
