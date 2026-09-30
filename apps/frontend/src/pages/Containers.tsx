import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { api } from '../lib/api';
import { containersSocket } from '../lib/containersSocket';
import { metricsSocket } from '../lib/metricsSocket';
import { formatBytes } from '../lib/format';
import type { Container, ContainerMetricSample, HostMetricSample } from '../types';
import Card from '../components/ui/Card';
import Badge, { BadgeTone } from '../components/ui/Badge';
import MetricChart, { MetricPoint } from '../components/MetricChart';

const HISTORY_WINDOW_MS = 60 * 60 * 1000;

const STATE_TONE: Record<string, BadgeTone> = {
  running: 'success',
  restarting: 'warning',
  paused: 'warning',
  exited: 'muted',
  dead: 'danger',
  created: 'muted',
};

function ContainerListItem({
  container,
  selected,
  onSelect,
}: {
  container: Container;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        onClick={onSelect}
        className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
          selected ? 'border-accent bg-surface-alt' : 'border-border hover:bg-surface-alt'
        }`}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="truncate text-sm text-primary">{container.name}</span>
          <Badge tone={STATE_TONE[container.state] ?? 'muted'}>{container.state}</Badge>
        </div>
        <div className="truncate font-mono text-xs text-muted">{container.image}</div>
      </button>
    </li>
  );
}

// Контейнеры уже приходят с бэкенда отсортированными по группе — здесь только
// разбиваем на смежные блоки, сохраняя порядок, а не пересчитываем сортировку.
function groupContainers(list: Container[]): [string, Container[]][] {
  const groups = new Map<string, Container[]>();
  for (const container of list) {
    const bucket = groups.get(container.group) ?? [];
    bucket.push(container);
    groups.set(container.group, bucket);
  }
  return Array.from(groups.entries());
}

function ContainerSection({
  title,
  containers,
  selectedId,
  onSelect,
}: {
  title: string;
  containers: Container[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (containers.length === 0) {
    return null;
  }
  return (
    <div className="mb-4">
      <div className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-primary">{title}</div>
      {groupContainers(containers).map(([groupName, items]) => (
        <div key={groupName} className="mb-2">
          <div className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-muted">{groupName}</div>
          <ul className="space-y-1.5">
            {items.map((container) => (
              <ContainerListItem
                key={container.id}
                container={container}
                selected={container.id === selectedId}
                onSelect={() => onSelect(container.id)}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function Containers() {
  const { t } = useTranslation();
  const [containers, setContainers] = useState<Container[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [metricsHistory, setMetricsHistory] = useState<ContainerMetricSample[]>([]);
  const [hostHistory, setHostHistory] = useState<HostMetricSample[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.listContainers().then(setContainers);
  }, []);

  useEffect(() => {
    api.getHostMetrics().then(setHostHistory);
    metricsSocket.connect();
    const onHost = (sample: HostMetricSample) => {
      setHostHistory((prev) => {
        const cutoff = Date.now() - HISTORY_WINDOW_MS;
        return [...prev, sample].filter((s) => s.timestamp >= cutoff);
      });
    };
    metricsSocket.on('host', onHost);
    return () => {
      metricsSocket.off('host', onHost);
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLogLines([]);

    containersSocket.connect();
    containersSocket.emit('subscribe', selectedId);

    const onLog = (line: string) => setLogLines((prev) => [...prev, line]);
    containersSocket.on('log', onLog);

    return () => {
      containersSocket.emit('unsubscribe');
      containersSocket.off('log', onLog);
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setMetricsHistory([]);
      return;
    }
    api.getContainerMetricsHistory(selectedId).then(setMetricsHistory);

    const onContainer = ({ containerId, sample }: { containerId: string; sample: ContainerMetricSample }) => {
      if (containerId !== selectedId) return;
      setMetricsHistory((prev) => {
        const cutoff = Date.now() - HISTORY_WINDOW_MS;
        return [...prev, sample].filter((s) => s.timestamp >= cutoff);
      });
    };
    metricsSocket.on('container', onContainer);
    return () => {
      metricsSocket.off('container', onContainer);
    };
  }, [selectedId]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' });
  }, [logLines]);

  const selected = containers.find((c) => c.id === selectedId);
  const runningContainers = containers.filter((c) => c.state === 'running');
  const inactiveContainers = containers.filter((c) => c.state !== 'running');

  const hostCpuPoints: MetricPoint[] = hostHistory.map((s) => ({ timestamp: s.timestamp, value: s.cpuPercent }));
  const hostMemPoints: MetricPoint[] = hostHistory.map((s) => ({ timestamp: s.timestamp, value: s.memUsedBytes }));
  const hostDiskPoints: MetricPoint[] = hostHistory.map((s) => ({ timestamp: s.timestamp, value: s.diskUsedBytes }));
  const lastHost = hostHistory[hostHistory.length - 1];
  const lastContainerMetric = metricsHistory[metricsHistory.length - 1];

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-primary">{t('metrics.host')}</h2>
        <div className="grid grid-cols-3 gap-6">
          <MetricChart label={t('metrics.cpu')} points={hostCpuPoints} formatValue={(v) => `${v.toFixed(1)}%`} max={100} />
          <MetricChart
            label={t('metrics.memory')}
            points={hostMemPoints}
            formatValue={formatBytes}
            max={lastHost?.memTotalBytes}
            sub={
              lastHost &&
              t('metrics.availableOf', {
                free: formatBytes(lastHost.memTotalBytes - lastHost.memUsedBytes),
                total: formatBytes(lastHost.memTotalBytes),
              })
            }
          />
          <MetricChart
            label={t('metrics.disk')}
            points={hostDiskPoints}
            formatValue={formatBytes}
            max={lastHost?.diskTotalBytes}
            sub={
              lastHost &&
              t('metrics.availableOf', {
                free: formatBytes(lastHost.diskTotalBytes - lastHost.diskUsedBytes),
                total: formatBytes(lastHost.diskTotalBytes),
              })
            }
          />
        </div>
      </Card>

      <div className="grid grid-cols-[320px_1fr] gap-5">
        <div>
          <h1 className="mb-3 text-lg font-semibold text-primary">{t('containers.title')}</h1>

          <ContainerSection
            title={t('containers.running')}
            containers={runningContainers}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <ContainerSection
            title={t('containers.inactive')}
            containers={inactiveContainers}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          {containers.length === 0 && <p className="px-1 text-sm text-muted">{t('containers.empty')}</p>}
        </div>

        {selected && (
          <div className="space-y-4">
            <Card className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-primary">{selected.name}</span>
                <Badge tone={STATE_TONE[selected.state] ?? 'muted'}>{selected.state}</Badge>
                {selected.project && (
                  <NavLink to={`/projects/${selected.project.id}`}>
                    <Badge tone="accent">{selected.project.name}</Badge>
                  </NavLink>
                )}
              </div>
              <p className="font-mono text-xs text-muted">{selected.status}</p>
              {selected.ports.length > 0 && (
                <p className="font-mono text-xs text-muted">
                  {selected.ports
                    .map((port) => (port.publicPort ? `${port.publicPort}→${port.privatePort}` : `${port.privatePort}`))
                    .join(', ')}
                </p>
              )}
            </Card>

            {selected.state === 'running' && (
              <Card className="p-4">
                <div className="grid grid-cols-2 gap-6">
                  <MetricChart
                    label={t('metrics.cpu')}
                    points={metricsHistory.map((s): MetricPoint => ({ timestamp: s.timestamp, value: s.cpuPercent }))}
                    formatValue={(v) => `${v.toFixed(1)}%`}
                    max={100}
                  />
                  <MetricChart
                    label={t('metrics.memory')}
                    points={metricsHistory.map((s): MetricPoint => ({ timestamp: s.timestamp, value: s.memUsedBytes }))}
                    formatValue={formatBytes}
                    max={lastContainerMetric?.memLimitBytes}
                    sub={
                      lastContainerMetric &&
                      t('metrics.availableOf', {
                        free: formatBytes(lastContainerMetric.memLimitBytes - lastContainerMetric.memUsedBytes),
                        total: formatBytes(lastContainerMetric.memLimitBytes),
                      })
                    }
                  />
                </div>
              </Card>
            )}

            <Card>
              <div className="border-b border-border px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted">
                {t('nav.logs')}
              </div>
              <div className="max-h-[32rem] overflow-y-auto bg-surface-alt p-4 font-mono text-xs leading-relaxed text-primary">
                {logLines.length === 0 && <p className="text-muted">{t('containers.logEmpty')}</p>}
                {logLines.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
                <div ref={logEndRef} />
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
