import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import PgBoss from 'pg-boss';
import { PrismaService } from '../prisma/prisma.service';
import { BuildRunnerService } from './build-runner.service';

// Одна очередь pg-boss на проект = один воркер на проект (раздел 3 CLAUDE.md:
// "сборки одного проекта не идут параллельно"). pg-boss по умолчанию обрабатывает
// задания очереди последовательно, если явно не увеличивать teamSize — увеличивать
// его здесь не нужно.
@Injectable()
export class BuildQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BuildQueueService.name);
  private readonly boss = new PgBoss(process.env.DATABASE_URL ?? '');
  private readonly registeredQueues = new Set<string>();

  constructor(
    private readonly runner: BuildRunnerService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    await this.boss.start();
    // Джобы, отправленные в очередь до рестарта (сборка была в статусе 'queued',
    // когда предыдущий процесс умер), никуда не делись — они лежат в pg-boss.
    // Но их некому забрать: registeredQueues в памяти пустой, а work() регистрируется
    // только внутри enqueue(). Без этого прохода такая сборка молча висит в 'queued',
    // пока кто-то не запустит новую сборку того же проекта.
    const projects = await this.prisma.project.findMany({ select: { id: true } });
    await Promise.all(projects.map((project) => this.ensureQueue(this.queueName(project.id))));
  }

  async onModuleDestroy() {
    await this.boss.stop({ graceful: true });
  }

  async enqueue(projectId: string, buildId: string) {
    const queueName = this.queueName(projectId);
    await this.ensureQueue(queueName);
    await this.boss.send(queueName, { buildId });
  }

  private async ensureQueue(queueName: string) {
    if (this.registeredQueues.has(queueName)) {
      return;
    }
    this.registeredQueues.add(queueName);
    await this.boss.createQueue(queueName);
    await this.boss.work<{ buildId: string }>(queueName, async ([job]) => {
      try {
        await this.runner.run(job.data.buildId);
      } catch (error) {
        this.logger.error(`Сборка ${job.data.buildId} завершилась с необработанной ошибкой`, (error as Error).stack);
      }
    });
  }

  private queueName(projectId: string) {
    return `build-${projectId}`;
  }
}
