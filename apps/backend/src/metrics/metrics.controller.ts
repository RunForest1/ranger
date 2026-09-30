import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { HostMetricsService } from './host-metrics.service';
import { ContainerMetricsService } from './container-metrics.service';

@UseGuards(SessionGuard)
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly hostMetrics: HostMetricsService,
    private readonly containerMetrics: ContainerMetricsService,
  ) {}

  // Часовая история — для начального рендера графика до того, как подключится
  // WebSocket. Не пересчитывает CPU% заново (см. комментарий у tick()).
  @Get('host')
  getHost() {
    return this.hostMetrics.getHistory();
  }

  @Get('containers/:id')
  getContainerHistory(@Param('id') id: string) {
    return this.containerMetrics.getHistory(id);
  }
}
