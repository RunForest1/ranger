import { Injectable } from '@nestjs/common';
import { readFileSync, statfsSync } from 'fs';
import { WORKDIR_CONTAINER_ROOT } from '../builds/workdir-paths';

export interface HostMetricSample {
  timestamp: number;
  cpuPercent: number;
  memUsedBytes: number;
  memTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
}

interface CpuTimes {
  idle: number;
  total: number;
}

const HISTORY_WINDOW_MS = 60 * 60 * 1000;

// /proc/stat и /proc/meminfo не namespace'дны Docker'ом — из непривилегированного
// контейнера они читаются как агрегатные счётчики ХОСТА, не самого контейнера, это
// ровно то, что нужно для "метрик хоста" (раздел 5 CLAUDE.md, итерация 3). Диск
// меряем на смонтированном bind-mount'е чекаутов — это гарантированно реальный путь
// хоста, а не пиши-слой самого backend-контейнера.
//
// Часовая история хранится так же, как у ContainerMetricsService, — единый способ
// показывать график метрики (текущее значение + тренд), общий для хоста и контейнеров.
@Injectable()
export class HostMetricsService {
  private previousCpuTimes: CpuTimes | null = null;
  private readonly history: HostMetricSample[] = [];

  // Вызывается только из периодического тика в MetricsGateway — CPU% считается по
  // дельте с предыдущим вызовом, поэтому вызывать его откуда-то ещё (например, из
  // REST-контроллера) сбило бы интервал между замерами и исказило бы проценты.
  // Контроллер читает уже накопленную историю через getHistory().
  tick(): HostMetricSample {
    const sample: HostMetricSample = {
      timestamp: Date.now(),
      cpuPercent: this.sampleCpuPercent(),
      ...this.sampleMemory(),
      ...this.sampleDisk(),
    };
    this.history.push(sample);
    const cutoff = Date.now() - HISTORY_WINDOW_MS;
    while (this.history.length > 0 && this.history[0].timestamp < cutoff) {
      this.history.shift();
    }
    return sample;
  }

  getHistory(): HostMetricSample[] {
    return this.history;
  }

  private sampleCpuPercent(): number {
    const firstLine = readFileSync('/proc/stat', 'utf8').split('\n', 1)[0];
    const fields = firstLine.trim().split(/\s+/).slice(1).map(Number);
    const idle = (fields[3] ?? 0) + (fields[4] ?? 0);
    const total = fields.reduce((sum, n) => sum + n, 0);
    const current: CpuTimes = { idle, total };

    const previous = this.previousCpuTimes;
    this.previousCpuTimes = current;
    if (!previous) {
      return 0;
    }
    const idleDelta = current.idle - previous.idle;
    const totalDelta = current.total - previous.total;
    if (totalDelta <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
  }

  private sampleMemory(): Pick<HostMetricSample, 'memUsedBytes' | 'memTotalBytes'> {
    const text = readFileSync('/proc/meminfo', 'utf8');
    const read = (key: string) => {
      const match = text.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'));
      return match ? Number(match[1]) * 1024 : 0;
    };
    const memTotalBytes = read('MemTotal');
    const memAvailableBytes = read('MemAvailable');
    return { memUsedBytes: Math.max(0, memTotalBytes - memAvailableBytes), memTotalBytes };
  }

  private sampleDisk(): Pick<HostMetricSample, 'diskUsedBytes' | 'diskTotalBytes'> {
    const stats = statfsSync(WORKDIR_CONTAINER_ROOT);
    const diskTotalBytes = stats.blocks * stats.bsize;
    const diskFreeBytes = stats.bavail * stats.bsize;
    return { diskUsedBytes: Math.max(0, diskTotalBytes - diskFreeBytes), diskTotalBytes };
  }
}
