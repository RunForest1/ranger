import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { hasRole, useRole } from '../stores/auth.store';
import { useProjectsStore } from '../stores/projects.store';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import EnvVariablesEditor, { envRowsToVariables, storedEnvRows } from '../components/EnvVariablesEditor';
import type { DeployMode, Project } from '../types';

const inputClass =
  'mt-1 w-full rounded-md border border-border bg-surface-alt px-3 py-2 text-primary outline-none focus:border-accent';
const labelClass = 'block text-sm font-medium text-primary';
const hintClass = 'mt-1 text-xs text-muted';

function DeployKeyCard({ project }: { project: Project }) {
  const { t } = useTranslation();
  const isAdmin = useRole() === 'admin';
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);

  function cancel() {
    setReplaceOpen(false);
    setValue('');
    setError(null);
  }

  async function handleReveal() {
    setRevealError(null);
    setRevealing(true);
    try {
      const { privateKey } = await api.revealDeployKey(project.id);
      setRevealedKey(privateKey);
    } catch (err) {
      setRevealError((err as Error).message);
    } finally {
      setRevealing(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.replaceDeployKey(project.id, value);
      setNotice(t('projects.edit.deployKeyReplaced'));
      setRevealedKey(null);
      cancel();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-primary">{t('projects.overview.deployKeyTitle')}</h2>
        {project.deployKey ? (
          <Badge tone="success">{t('projects.overview.deployKeySet')}</Badge>
        ) : (
          <Badge tone="danger">{t('projects.overview.deployKeyMissing')}</Badge>
        )}
      </div>

      {isAdmin && project.deployKey && (
        <div className="space-y-2 border-t border-border pt-3">
          {revealedKey === null ? (
            <>
              <p className={hintClass}>{t('projects.edit.revealDeployKeyHint')}</p>
              {revealError && <p className="text-sm text-danger">{revealError}</p>}
              <Button type="button" variant="secondary" disabled={revealing} onClick={handleReveal}>
                {t('projects.edit.revealDeployKey')}
              </Button>
            </>
          ) : (
            <>
              <textarea
                readOnly
                rows={4}
                value={revealedKey}
                onFocus={(e) => e.currentTarget.select()}
                className={`${inputClass} font-mono`}
              />
              <Button type="button" variant="ghost" onClick={() => setRevealedKey(null)}>
                {t('projects.edit.hideDeployKey')}
              </Button>
            </>
          )}
        </div>
      )}

      {!replaceOpen ? (
        <>
          <p className={hintClass}>{t('projects.edit.deployKeyHint')}</p>
          {notice && <p className="text-sm text-success">{notice}</p>}
          <Button type="button" variant="secondary" onClick={() => setReplaceOpen(true)}>
            {t('projects.edit.replaceDeployKey')}
          </Button>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className={labelClass}>
            {t('projects.new.deployKey')}
            <textarea
              required
              autoFocus
              rows={4}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </label>
          <p className={hintClass}>{t('projects.edit.replaceDeployKeyWarning')}</p>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {t('projects.edit.replaceDeployKeyConfirm')}
            </Button>
            <Button type="button" variant="ghost" onClick={cancel}>
              {t('projects.edit.cancel')}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

// Отдельно от основной формы, как и deploy-key: значения секретные, сервер их не
// отдаёт, и сохраняются они своим запросом (PUT /projects/:id/env).
function EnvCard({ project }: { project: Project }) {
  const { t } = useTranslation();
  const isAdmin = useRole() === 'admin';
  const [savedKeys, setSavedKeys] = useState(project.envKeys);
  const [rows, setRows] = useState(() => storedEnvRows(project.envKeys));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);

  async function handleSave() {
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const updated = await api.setProjectEnv(project.id, envRowsToVariables(rows));
      setSavedKeys(updated.envKeys);
      setRows(storedEnvRows(updated.envKeys));
      setRevealed(null);
      setNotice(t('projects.env.saved'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReveal() {
    setRevealError(null);
    setRevealing(true);
    try {
      const { env } = await api.revealProjectEnv(project.id);
      setRevealed(
        Object.entries(env)
          .map(([key, value]) => `${key}=${value}`)
          .join('\n'),
      );
    } catch (err) {
      setRevealError((err as Error).message);
    } finally {
      setRevealing(false);
    }
  }

  return (
    <Card className="space-y-3 p-5">
      <h2 className="text-sm font-semibold text-primary">{t('projects.env.title')}</h2>
      <p className={hintClass}>{t('projects.env.hint')}</p>

      <EnvVariablesEditor rows={rows} onChange={setRows} />

      {error && <p className="text-sm text-danger">{error}</p>}
      {notice && <p className="text-sm text-success">{notice}</p>}
      <Button type="button" disabled={submitting} onClick={handleSave}>
        {t('projects.env.save')}
      </Button>

      {isAdmin && savedKeys.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          {revealed === null ? (
            <>
              <p className={hintClass}>{t('projects.env.revealHint')}</p>
              {revealError && <p className="text-sm text-danger">{revealError}</p>}
              <Button type="button" variant="secondary" disabled={revealing} onClick={handleReveal}>
                {t('projects.env.reveal')}
              </Button>
            </>
          ) : (
            <>
              <textarea
                readOnly
                rows={Math.min(10, Math.max(3, savedKeys.length))}
                value={revealed}
                onFocus={(e) => e.currentTarget.select()}
                className={`${inputClass} font-mono`}
              />
              <Button type="button" variant="ghost" onClick={() => setRevealed(null)}>
                {t('projects.env.hide')}
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

// Только для admin: compose-файл из репозитория может запросить privileged, Docker-сокет
// или корень хоста, так что включить такой режим — значит доверить репозиторию сервер.
function DeployModeCard({ project, onChange }: { project: Project; onChange: (project: Project) => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<DeployMode>(project.deployMode);
  const [composeFile, setComposeFile] = useState(project.composeFile);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const changed = mode !== project.deployMode || composeFile !== project.composeFile;

  async function handleSave() {
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      onChange(await api.setDeployMode(project.id, mode, composeFile));
      setNotice(t('projects.deployMode.saved'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="space-y-3 p-5">
      <h2 className="text-sm font-semibold text-primary">{t('projects.deployMode.title')}</h2>
      <div className="space-y-2">
        <label className="flex items-start gap-2 text-sm text-primary">
          <input type="radio" checked={mode === 'container'} onChange={() => setMode('container')} className="mt-1" />
          <span>
            {t('projects.deployMode.container')}
            <span className={`block ${hintClass}`}>{t('projects.deployMode.containerHint')}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-primary">
          <input type="radio" checked={mode === 'compose'} onChange={() => setMode('compose')} className="mt-1" />
          <span>
            {t('projects.deployMode.compose')}
            <span className={`block ${hintClass}`}>{t('projects.deployMode.composeHint')}</span>
          </span>
        </label>
      </div>

      {mode === 'compose' && (
        <>
          <label className={labelClass}>
            {t('projects.deployMode.composeFile')}
            <input
              required
              value={composeFile}
              onChange={(e) => setComposeFile(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </label>
          <p className="text-sm text-warning">{t('projects.deployMode.composeWarning')}</p>
        </>
      )}

      {changed && mode !== project.deployMode && (
        <p className={hintClass}>{t('projects.deployMode.switchHint')}</p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      {notice && <p className="text-sm text-success">{notice}</p>}
      <Button type="button" disabled={!changed || submitting} onClick={handleSave}>
        {t('projects.deployMode.save')}
      </Button>
    </Card>
  );
}

function DeleteProjectCard({ project }: { project: Project }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const refreshProjects = useProjectsStore((s) => s.refresh);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteProject(project.id);
      await refreshProjects();
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
      setDeleting(false);
    }
  }

  return (
    <Card className="space-y-3 border-danger p-5">
      <h2 className="text-sm font-semibold text-danger">{t('projects.edit.dangerZone')}</h2>
      {!confirming ? (
        <>
          <p className={hintClass}>{t('projects.edit.deleteHint')}</p>
          <Button type="button" variant="secondary" className="!border-danger !text-danger" onClick={() => setConfirming(true)}>
            {t('projects.edit.delete')}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-danger">{t('projects.edit.deleteConfirm', { name: project.name })}</p>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="!border-danger !text-danger"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? t('projects.edit.deleting') : t('projects.edit.deleteConfirmButton')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={deleting}>
              {t('projects.edit.cancel')}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

export default function EditProject() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const refreshProjects = useProjectsStore((s) => s.refresh);
  const role = useRole();
  const canEdit = hasRole(role, 'operator');

  const [project, setProject] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [installCmd, setInstallCmd] = useState('');
  const [testCmd, setTestCmd] = useState('');
  const [buildCmd, setBuildCmd] = useState('');
  const [triggerMode, setTriggerMode] = useState<'manual' | 'cron'>('manual');
  const [cronExpr, setCronExpr] = useState('');
  const [deployOpen, setDeployOpen] = useState(false);
  const [containerPort, setContainerPort] = useState('');
  const [hostPort, setHostPort] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    api.getProject(projectId).then((p) => {
      setProject(p);
      setName(p.name);
      setGitUrl(p.gitUrl);
      setBranch(p.branch);
      setInstallCmd(p.installCmd ?? '');
      setTestCmd(p.testCmd ?? '');
      setBuildCmd(p.buildCmd ?? '');
      setTriggerMode(p.triggerMode);
      setCronExpr(p.cronExpr ?? '');
      setContainerPort(p.containerPort != null ? String(p.containerPort) : '');
      setHostPort(p.hostPort != null ? String(p.hostPort) : '');
      setDeployOpen(p.containerPort != null || p.hostPort != null);
      setIsPublic(p.isPublic);
    });
  }, [projectId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!projectId) return;
    setError(null);
    if (!installCmd.trim() && !testCmd.trim() && !buildCmd.trim()) {
      setError(t('projects.new.needCommand'));
      return;
    }
    if (project?.deployMode !== 'compose' && deployOpen && (!containerPort.trim() || !hostPort.trim())) {
      setError(t('projects.new.deployPortsRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await api.updateProject(projectId, {
        name,
        gitUrl,
        branch,
        installCmd,
        testCmd,
        buildCmd,
        triggerMode,
        cronExpr: triggerMode === 'cron' ? cronExpr : '',
        containerPort: deployOpen && containerPort ? Number(containerPort) : null,
        hostPort: deployOpen && hostPort ? Number(hostPort) : null,
        isPublic,
      });
      await refreshProjects();
      navigate(`/projects/${projectId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!canEdit) {
    return <p className="text-sm text-muted">{t('users.forbidden')}</p>;
  }

  if (!project) {
    return null;
  }

  const isCompose = project.deployMode === 'compose';
  // Совпадает с проверкой в projects.service.ts: источник compose-файла меняет только admin.
  const sourceLocked = isCompose && role !== 'admin';
  const lockedClass = sourceLocked ? 'text-muted' : '';

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-lg font-semibold text-primary">{t('projects.edit.title')}</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card className="space-y-4 p-5">
          <label className={labelClass}>
            {t('projects.new.name')}
            <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            {t('projects.new.gitUrl')}
            <input
              required
              readOnly={sourceLocked}
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              className={`${inputClass} font-mono ${lockedClass}`}
            />
          </label>
          <label className={labelClass}>
            {t('projects.new.branch')}
            <input
              required
              readOnly={sourceLocked}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className={`${inputClass} font-mono ${lockedClass}`}
            />
          </label>
          {sourceLocked && <p className={hintClass}>{t('projects.deployMode.sourceLocked')}</p>}
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-semibold text-primary">{t('projects.new.commandsTitle')}</h2>
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
            <input
              type="radio"
              checked={triggerMode === 'cron'}
              onChange={() => setTriggerMode('cron')}
              className="mr-1"
            />
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
        </Card>

        {isCompose ? (
          <Card className="space-y-2 p-5">
            <h2 className="text-sm font-semibold text-primary">{t('projects.new.deployTitle')}</h2>
            <p className="text-sm text-primary">
              {t('projects.deployMode.composeActive')}{' '}
              <span className="font-mono">{project.composeFile}</span>
            </p>
            <p className={hintClass}>{t('projects.deployMode.changedByAdmin')}</p>
          </Card>
        ) : (
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
        )}

        <Card className="space-y-2 p-5">
          <label className="flex items-center gap-2 text-sm font-medium text-primary">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            {t('projects.edit.isPublic')}
          </label>
          <p className={hintClass}>
            {t('projects.edit.isPublicHint')}{' '}
            <a href="/status" target="_blank" rel="noreferrer" className="font-mono text-accent hover:underline">
              /status
            </a>
          </p>
        </Card>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            {t('projects.edit.submit')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate(`/projects/${projectId}`)}>
            {t('projects.edit.cancel')}
          </Button>
        </div>
      </form>

      {role === 'admin' && <DeployModeCard project={project} onChange={setProject} />}
      <EnvCard project={project} />
      <DeployKeyCard project={project} />
      <DeleteProjectCard project={project} />
    </div>
  );
}
