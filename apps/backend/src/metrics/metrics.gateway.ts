import { OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { OnModuleDestroy } from '@nestjs/common';
import { Server } from 'socket.io';
import { HostMetricsService } from './host-metrics.service';
import { ContainerMetricsService } from './container-metrics.service';

const SAMPLE_INTERVAL_MS = 5_000;

// Отдельный namespace — по той же причине, что и у containers.gateway.ts: несколько
// гейтвеев в общем namespace делят события между собой. Здесь же клиенту вообще
// нечего "подписывать" — метрики транслируются широковещательно всем подключённым,
// объём тика ничтожен (пара чисел на контейнер раз в несколько секунд).
@WebSocketGateway({ namespace: 'metrics', cors: { origin: true, credentials: true } })
export class MetricsGateway implements OnGatewayInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private interval?: NodeJS.Timeout;

  constructor(
    private readonly hostMetrics: HostMetricsService,
    private readonly containerMetrics: ContainerMetricsService,
  ) {}

  afterInit() {
    this.interval = setInterval(() => this.tick(), SAMPLE_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  private async tick() {
    this.server.emit('host', this.hostMetrics.tick());

    const latest = await this.containerMetrics.sampleAll();
    for (const [containerId, sample] of latest) {
      this.server.emit('container', { containerId, sample });
    }
  }
}
