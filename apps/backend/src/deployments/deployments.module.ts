import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DeploymentsController } from './deployments.controller';
import { DeploymentsService } from './deployments.service';
import { DeployRunnerService } from './deploy-runner.service';
import { ComposeDeployService } from './compose-deploy.service';

@Module({
  imports: [AuditModule],
  controllers: [DeploymentsController],
  providers: [DeploymentsService, DeployRunnerService, ComposeDeployService],
  exports: [DeployRunnerService, ComposeDeployService],
})
export class DeploymentsModule {}
