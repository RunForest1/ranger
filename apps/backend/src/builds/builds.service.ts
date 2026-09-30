import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BuildQueueService } from './build-queue.service';

@Injectable()
export class BuildsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: BuildQueueService,
    private readonly audit: AuditService,
  ) {}

  // triggeredBy — id пользователя при ручном запуске или буквально 'cron' при
  // срабатывании расписания (см. раздел 4 CLAUDE.md и CronTriggerService).
  // В аудит попадают только ручные запуски — 'cron' не пользователь, писать не о ком.
  // branch не указан — основная ветка проекта (cron всегда собирает её).
  async trigger(projectId: string, triggeredBy: string, branch?: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('Проект не найден');
    }

    const build = await this.prisma.build.create({
      data: { projectId, status: 'queued', triggeredBy, branch: branch || project.branch },
    });

    if (triggeredBy !== 'cron') {
      await this.audit.record(triggeredBy, 'trigger_build', projectId);
    }

    await this.queue.enqueue(projectId, build.id);
    return build;
  }

  findAllForProject(projectId: string) {
    return this.prisma.build.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: { testResults: true },
    });
  }

  async findOne(id: string) {
    const build = await this.prisma.build.findUnique({ where: { id }, include: { testResults: true } });
    if (!build) {
      throw new NotFoundException('Сборка не найдена');
    }
    return build;
  }
}
