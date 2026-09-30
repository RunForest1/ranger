import { Module } from '@nestjs/common';
import { DeploymentsModule } from '../deployments/deployments.module';
import { AuditModule } from '../audit/audit.module';
import { BuildsController } from './builds.controller';
import { BuildsService } from './builds.service';
import { BuildQueueService } from './build-queue.service';
import { BuildRunnerService } from './build-runner.service';
import { BuildsGateway } from './builds.gateway';
import { CronTriggerService } from './cron-trigger.service';

@Module({
  imports: [DeploymentsModule, AuditModule],
  controllers: [BuildsController],
  providers: [BuildsService, BuildQueueService, BuildRunnerService, BuildsGateway, CronTriggerService],
  exports: [CronTriggerService],
})
export class BuildsModule {}
