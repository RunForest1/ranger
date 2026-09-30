import { Injectable } from '@nestjs/common';
import { ContainerStats } from 'dockerode';
import { DockerService } from '../docker/docker.service';

export interface ContainerMetricSample {
  timestamp: number;
  cpuPercent: number;
  memUsedBytes: number;
  memLimitBytes: number;
}

const HISTORY_WINDOW_MS = 60 * 60 * 1000;

// `docker stats` без --stream отдаёт разово и cpu_stats, и precpu_stats (окно
// предыдущего замера) в одном ответе — процент CPU считается из одного вызова,
// без необходимости хранить своё предыдущее состояние (раздел 5 CLAUDE.md:
// "docker stats, не Prometheus").
@Injectable()
export class ContainerMetricsService {
  private readonly history = new Map<string, ContainerMetricSample[]>();

  constructor(private readonly docker: DockerService) {}

  async sampleAll(): Promise<Map<string, ContainerMetricSample>> {
    const containers = await this.docker.listContainers({ filters: JSON.stringify({ status: ['running'] }) });
    const latest = new Map<string, ContainerMetricSample>();

    await Promise.all(
      containers.map(async (container) => {
        const sample = await this.sampleOne(container.Id);
        if (sample) {
          latest.set(container.Id, sample);
        }
      }),
    );

    const runningIds = new Set(containers.map((c) => c.Id));
    for (const id of this.history.keys()) {
      if (!runningIds.has(id)) {
        this.history.delete(id);
      }
    }

    return latest;
  }

  getHistory(containerId: string): ContainerMetricSample[] {
    return this.history.get(containerId) ?? [];
  }

  private async sampleOne(containerId: string): Promise<ContainerMetricSample | null> {
    try {
      const stats = await this.docker.getContainer(containerId).stats({ stream: false });
      const sample = this.computeSample(stats);
      const list = this.history.get(containerId) ?? [];
      list.push(sample);
      const cutoff = Date.now() - HISTORY_WINDOW_MS;
      while (list.length > 0 && list[0].timestamp < cutoff) {
        list.shift();
      }
      this.history.set(containerId, list);
      return sample;
    } catch {
      // Контейнер мог остановиться между listContainers и stats() — пропускаем тик,
      // не критично, следующий тик его уже не увидит среди running.
      return null;
    }
  }

  private computeSample(stats: ContainerStats): ContainerMetricSample {
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = (stats.cpu_stats.system_cpu_usage ?? 0) - (stats.precpu_stats.system_cpu_usage ?? 0);
    const cpuCount = stats.cpu_stats.online_cpus || stats.cpu_stats.cpu_usage.percpu_usage?.length || 1;
    const cpuPercent = systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0;

    // cache исключается из usage — иначе память "растёт" из-за файлового кеша ядра,
    // который контейнер по требованию тут же отдаёт назад (тот же трюк, что в `docker stats`).
    const memUsedBytes = stats.memory_stats.usage - (stats.memory_stats.stats?.cache ?? 0);

    return {
      timestamp: Date.now(),
      cpuPercent: Math.max(0, cpuPercent),
      memUsedBytes: Math.max(0, memUsedBytes),
      memLimitBytes: stats.memory_stats.limit,
    };
  }
}
