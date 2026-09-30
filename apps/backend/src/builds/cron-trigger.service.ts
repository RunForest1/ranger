import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import cron, { ScheduledTask } from 'node-cron';
import { PrismaService } from '../prisma/prisma.service';
import { BuildsService } from './builds.service';

// Однопроцессный in-process планировщик — Ranger живёт на одном хосте, не в
// кластере (раздел 3 CLAUDE.md), поэтому нет смысла тащить распределённый cron
// поверх pg-boss ради единственного инстанса. Карта projectId -> задача node-cron
// живёт только в памяти и пересобирается из БД при каждом старте процесса.
@Injectable()
export class CronTriggerService implements OnModuleInit {
  private readonly logger = new Logger(CronTriggerService.name);
  private readonly tasks = new Map<string, ScheduledTask>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly buildsService: BuildsService,
  ) {}

  async onModuleInit() {
    const projects = await this.prisma.project.findMany({
      where: { triggerMode: 'cron', cronExpr: { not: null } },
    });
    for (const project of projects) {
      this.schedule(project.id, project.cronExpr!);
    }
  }

  // Вызывается из ProjectsService после создания/изменения проекта — синхронизирует
  // запланированную задачу с актуальными triggerMode/cronExpr.
  reschedule(projectId: string, triggerMode: string, cronExpr: string | null) {
    this.unschedule(projectId);
    if (triggerMode === 'cron' && cronExpr) {
      this.schedule(projectId, cronExpr);
    }
  }

  unschedule(projectId: string) {
    this.tasks.get(projectId)?.stop();
    this.tasks.delete(projectId);
  }

  private schedule(projectId: string, cronExpr: string) {
    if (!cron.validate(cronExpr)) {
      this.logger.warn(`Проект ${projectId}: некорректное cron-выражение "${cronExpr}", расписание не создано`);
      return;
    }
    const task = cron.schedule(cronExpr, () => {
      this.buildsService.trigger(projectId, 'cron').catch((error) => {
        this.logger.error(`Cron-сборка проекта ${projectId} не запустилась`, (error as Error).stack);
      });
    });
    this.tasks.set(projectId, task);
  }
}
