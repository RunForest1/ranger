import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { HostMetricsService } from './host-metrics.service';
import { ContainerMetricsService } from './container-metrics.service';
import { MetricsGateway } from './metrics.gateway';

@Module({
  controllers: [MetricsController],
  providers: [HostMetricsService, ContainerMetricsService, MetricsGateway],
})
export class MetricsModule {}
