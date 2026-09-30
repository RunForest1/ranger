import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { metricsSocket } from '../../lib/metricsSocket';
import { formatBytes } from '../../lib/format';
import type { ContainerMetricSample, Deployment, Project } from '../../types';
import Card from '../../components/ui/Card';
import MetricChart, { MetricPoint } from '../../components/MetricChart';

const HISTORY_WINDOW_MS = 60 * 60 * 1000;

export default function ProjectMetrics() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [containerId, setContainerId] = useState<string | null>(null);
  const [containerHistory, setContainerHistory] = useState<ContainerMetricSample[]>([]);

  useEffect(() => {
    if (!projectId) return;
    api.getProject(projectId).then(setProject);
    api.listDeployments(projectId).then((deployments: Deployment[]) => {
      const running = deployments.find((d) => d.status === 'running');
      setContainerId(running?.containerId ?? null);
    });
  }, [projectId]);

  useEffect(() => {
    if (!containerId) {
      setContainerHistory([]);
      return;
    }
    api.getContainerMetricsHistory(containerId).then(setContainerHistory);

    metricsSocket.connect();
    const onContainer = ({ containerId: id, sample }: { containerId: string; sample: ContainerMetricSample }) => {
      if (id !== containerId) return;
      setContainerHistory((prev) => {
        const cutoff = Date.now() - HISTORY_WINDOW_MS;
        return [...prev, sample].filter((s) => s.timestamp >= cutoff);
      });
    };
    metricsSocket.on('container', onContainer);
    return () => {
      metricsSocket.off('container', onContainer);
    };
  }, [containerId]);

  if (!project) {
    return null;
  }

  const cpuPoints: MetricPoint[] = containerHistory.map((s) => ({ timestamp: s.timestamp, value: s.cpuPercent }));
  const memPoints: MetricPoint[] = containerHistory.map((s) => ({ timestamp: s.timestamp, value: s.memUsedBytes }));
  const lastMetric = containerHistory[containerHistory.length - 1];

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold text-primary">{t('nav.metrics')}</h1>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-primary">{t('metrics.container')}</h2>
        {project.deployMode === 'compose' ? (
          <p className="text-sm text-muted">{t('metrics.composeHint')}</p>
        ) : !containerId ? (
          <p className="text-sm text-muted">{t('metrics.noContainer')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            <MetricChart label={t('metrics.cpu')} points={cpuPoints} formatValue={(v) => `${v.toFixed(1)}%`} max={100} />
            <MetricChart
              label={t('metrics.memory')}
              points={memPoints}
              formatValue={formatBytes}
              max={lastMetric?.memLimitBytes}
              sub={
                lastMetric &&
                t('metrics.availableOf', {
                  free: formatBytes(lastMetric.memLimitBytes - lastMetric.memUsedBytes),
                  total: formatBytes(lastMetric.memLimitBytes),
                })
              }
            />
          </div>
        )}
      </Card>
    </div>
  );
}
