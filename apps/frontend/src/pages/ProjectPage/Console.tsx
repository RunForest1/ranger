import { FormEvent, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '../../lib/api';
import { terminalSocket } from '../../lib/terminalSocket';
import { useRole } from '../../stores/auth.store';
import type { Project } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

type TerminalTarget = 'container' | 'workdir';
type Phase = 'idle' | 'reauth' | 'connecting' | 'active' | 'closed';

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default function ProjectConsole() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const isAdmin = useRole() === 'admin';

  const [project, setProject] = useState<Project | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [closedReason, setClosedReason] = useState<string | null>(null);
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [reauthSubmitting, setReauthSubmitting] = useState(false);
  const [password, setPassword] = useState('');
  const [pendingTarget, setPendingTarget] = useState<TerminalTarget | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  // Обработчики ресайза и сокета живут дольше одного рендера — текущую фазу
  // читают из ref, чтобы не пересоздавать подписки на каждое изменение состояния.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    if (projectId) {
      api.getProject(projectId).then(setProject);
    }
  }, [projectId]);

  useEffect(() => {
    if (!isAdmin || !containerRef.current) return;

    const term = new Terminal({
      convertEol: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
      theme: {
        background: cssVar('--color-surface-alt'),
        foreground: cssVar('--color-text'),
        cursor: cssVar('--color-accent'),
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;

    const onResize = () => {
      fit.fit();
      if (phaseRef.current === 'active') {
        terminalSocket.emit('resize', { cols: term.cols, rows: term.rows });
      }
    };
    window.addEventListener('resize', onResize);

    const onData = term.onData((data) => terminalSocket.emit('input', data));

    return () => {
      window.removeEventListener('resize', onResize);
      onData.dispose();
      term.dispose();
      termRef.current = null;
    };
  }, [isAdmin]);

  useEffect(() => {
    const onReady = () => {
      setPhase('active');
      setClosedReason(null);
      const term = termRef.current;
      if (term) {
        terminalSocket.emit('resize', { cols: term.cols, rows: term.rows });
      }
    };
    const onOutput = (data: string) => termRef.current?.write(data);
    const onReauthRequired = () => setPhase('reauth');
    const onFailure = ({ code, detail }: { code: string; detail?: string }) => {
      const message = detail ? `${t(`console.errors.${code}`)}: ${detail}` : t(`console.errors.${code}`);
      termRef.current?.write(`\r\n\x1b[31m[ranger] ${message}\x1b[0m\r\n`);
      setPhase('closed');
      setClosedReason(message);
    };
    // Сокет отклонён ещё на handshake (нет сессии) — см. session-io-adapter.ts.
    const onConnectError = () => onFailure({ code: 'unauthorized' });
    const onClosed = (reason: string) => {
      setPhase('closed');
      setClosedReason(t(`console.closedReasons.${reason}`));
    };

    terminalSocket.on('ready', onReady);
    terminalSocket.on('output', onOutput);
    terminalSocket.on('reauth_required', onReauthRequired);
    terminalSocket.on('failure', onFailure);
    terminalSocket.on('connect_error', onConnectError);
    terminalSocket.on('closed', onClosed);

    return () => {
      terminalSocket.off('ready', onReady);
      terminalSocket.off('output', onOutput);
      terminalSocket.off('reauth_required', onReauthRequired);
      terminalSocket.off('failure', onFailure);
      terminalSocket.off('connect_error', onConnectError);
      terminalSocket.off('closed', onClosed);
    };
  }, [t]);

  useEffect(() => {
    return () => {
      terminalSocket.emit('stop');
      terminalSocket.disconnect();
    };
  }, []);

  function start(target: TerminalTarget) {
    if (!projectId) return;
    termRef.current?.clear();
    setClosedReason(null);
    setPendingTarget(target);
    setPhase('connecting');
    terminalSocket.connect();
    terminalSocket.emit('start', { projectId, target });
  }

  async function handleReauth(event: FormEvent) {
    event.preventDefault();
    setReauthError(null);
    setReauthSubmitting(true);
    try {
      await api.reauth(password);
      setPassword('');
      if (pendingTarget) {
        setPhase('connecting');
        terminalSocket.emit('start', { projectId, target: pendingTarget });
      } else {
        setPhase('idle');
      }
    } catch (err) {
      setReauthError((err as Error).message);
    } finally {
      setReauthSubmitting(false);
    }
  }

  if (!isAdmin) {
    return <p className="text-sm text-muted">{t('console.errors.forbidden')}</p>;
  }

  const hasDeploy = project != null && project.containerPort != null && project.hostPort != null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-primary">{t('nav.console')}</h1>
        <div className="flex gap-2">
          {(phase === 'idle' || phase === 'closed') && (
            <>
              {hasDeploy && (
                <Button type="button" variant="secondary" onClick={() => start('container')}>
                  {t('console.startContainer')}
                </Button>
              )}
              <Button type="button" variant="secondary" onClick={() => start('workdir')}>
                {t('console.startWorkdir')}
              </Button>
            </>
          )}
          {phase === 'active' && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                terminalSocket.emit('stop');
                terminalSocket.disconnect();
                setPhase('closed');
                setClosedReason(t('console.closedReasons.stopped'));
              }}
            >
              {t('console.stop')}
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted">{t('console.hint')}</p>

      {phase === 'reauth' && (
        <Card className="max-w-sm space-y-3 p-5">
          <h2 className="text-sm font-semibold text-primary">{t('console.reauthTitle')}</h2>
          <p className="text-xs text-muted">{t('console.reauthHint')}</p>
          <form onSubmit={handleReauth} className="space-y-3">
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-surface-alt px-3 py-2 text-primary outline-none focus:border-accent"
            />
            {reauthError && <p className="text-sm text-danger">{reauthError}</p>}
            <Button type="submit" disabled={reauthSubmitting}>
              {t('console.reauthConfirm')}
            </Button>
          </form>
        </Card>
      )}

      {phase === 'closed' && closedReason && (
        <p className="text-sm text-muted">
          {t('console.closed')}: {closedReason}
        </p>
      )}

      <Card className="overflow-hidden p-2">
        <div ref={containerRef} className="h-[32rem]" />
      </Card>
    </div>
  );
}
