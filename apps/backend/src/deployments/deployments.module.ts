import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DeploymentsController } from './deployments.controller';
import { DeploymentsService } from './deployments.service';
import { DeployRunnerService } from './deploy-runner.service';

@Module({
  imports: [AuditModule],
  controllers: [DeploymentsController],
  providers: [DeploymentsService, DeployRunnerService],
  exports: [DeployRunnerService],
})
export class DeploymentsModule {}
