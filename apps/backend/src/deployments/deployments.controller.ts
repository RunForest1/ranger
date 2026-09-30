import { BadRequestException, Controller, Get, HttpCode, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { SessionGuard } from '../auth/session.guard';
import { RequireRole } from '../auth/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { DeploymentsService } from './deployments.service';
import { DeployRunnerService } from './deploy-runner.service';
import { decryptProjectEnv } from '../projects/project-env';

@UseGuards(SessionGuard)
@Controller()
export class DeploymentsController {
  constructor(
    private readonly deploymentsService: DeploymentsService,
    private readonly deployRunner: DeployRunnerService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('projects/:projectId/deployments')
  findAllForProject(@Param('projectId') projectId: string) {
    return this.deploymentsService.findAllForProject(projectId);
  }

  @Post('projects/:projectId/deployments/:id/rollback')
  @HttpCode(200)
  @RequireRole('operator')
  async rollback(@Param('projectId') projectId: string, @Param('id') id: string, @Req() req: Request) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('Проект не найден');
    }
    if (project.deployMode === 'compose') {
      throw new BadRequestException('Откат для compose-деплоя пока не поддерживается');
    }
    if (project.hostPort == null || project.containerPort == null) {
      throw new BadRequestException('У проекта не настроен деплой — нечего откатывать');
    }

    const logLines: string[] = [];
    const success = await this.deployRunner.rollbackToDeployment({
      projectId,
      deploymentId: id,
      hostPort: project.hostPort,
      containerPort: project.containerPort,
      env: decryptProjectEnv(project.encryptedEnv),
      onLog: (line) => logLines.push(line),
    });
    await this.audit.record(req.session.userId!, 'rollback_deployment', projectId);

    if (!success) {
      throw new BadRequestException(logLines.join('\n') || 'Откат не удался');
    }
    return { ok: true, log: logLines };
  }
}
