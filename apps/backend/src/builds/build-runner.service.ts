import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { appendFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'fs';
import { join } from 'path';
import { ensureImage, execute } from 'sandbox-executor';
import { PrismaService } from '../prisma/prisma.service';
import { BuildsGateway } from './builds.gateway';
import { decryptSecret } from '../common/secret-crypto';
import { ProjectEnv, decryptProjectEnv } from '../projects/project-env';
import { cloneRepository } from './clone-repository';
import { DeployRunnerService } from '../deployments/deploy-runner.service';
import { ComposeDeployService } from '../deployments/compose-deploy.service';
import { BuildStep, BuildStepName } from './builds.types';
import { WORKDIR_CONTAINER_ROOT, projectCheckoutDir, toHostPath } from './workdir-paths';

const BUILDER_IMAGE = 'ranger-builder:latest';
const STEP_TIMEOUT_MS = 15 * 60 * 1000;
const MEMORY_LIMIT_MB = 512;
const CPU_LIMIT = 1;
const SHELL_STEP_NAMES = ['install', 'test', 'build'] as const;
const LOGS_DIR = process.env.BUILD_LOGS_DIR ?? join(process.cwd(), 'data', 'build-logs');
// Короткие значения (PORT=3000, DEBUG=true) не маскируются: замена "3000" или "true"
// по всему логу сделала бы его нечитаемым, а секретом такие значения не бывают.
const MIN_MASKED_VALUE_LENGTH = 8;

// Команда пользователя может напечатать переменные (`env`, отладочный вывод) — значения
// не должны попасть ни в файл лога, ни в WebSocket (раздел 7 CLAUDE.md). Маскируется
// по целым строкам: значение, разрезанное границей чанка, иначе проскочило бы.
function createSecretMasker(env: ProjectEnv): (line: string) => string {
  const secrets = Object.values(env)
    .filter((value) => value.length >= MIN_MASKED_VALUE_LENGTH)
    .sort((a, b) => b.length - a.length);
  return (line) => secrets.reduce((masked, secret) => masked.split(secret).join('***'), line);
}

@Injectable()
export class BuildRunnerService implements OnModuleInit {
  private readonly logger = new Logger(BuildRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: BuildsGateway,
    private readonly deployRunner: DeployRunnerService,
    private readonly composeDeploy: ComposeDeployService,
  ) {}

  async onModuleInit() {
    if (!process.env.BUILD_WORKDIR_HOST_PATH) {
      throw new Error(
        'BUILD_WORKDIR_HOST_PATH не задан: без него bind-mount чекаута в контейнер сборки ' +
          'резолвится Docker-демоном на хосте неверно (backend ходит в Docker через сокет хоста). ' +
          'Укажите абсолютный путь на хосте, совпадающий с источником volume для backend в docker-compose.yml.',
      );
    }
    if (!existsSync(LOGS_DIR)) {
      mkdirSync(LOGS_DIR, { recursive: true });
    }
    if (!existsSync(WORKDIR_CONTAINER_ROOT)) {
      mkdirSync(WORKDIR_CONTAINER_ROOT, { recursive: true });
    }
    this.logger.log(`Собираю образ ${BUILDER_IMAGE}, если его ещё нет...`);
    await ensureImage({
      contextDir: join(__dirname, '..', '..', 'docker'),
      dockerfile: 'builder.Dockerfile',
      tag: BUILDER_IMAGE,
    });
    await this.recoverStuckBuilds();
  }

  async run(buildId: string) {
    const build = await this.prisma.build.findUniqueOrThrow({
      where: { id: buildId },
      include: { project: { include: { deployKey: true } } },
    });
    const { project } = build;

    await this.updateStatus(buildId, 'running', { startedAt: new Date() });

    // Шаг деплоя добавляется для compose-проекта или если у проекта заданы оба порта
    // (см. валидацию в projects.service.ts) — без них Ranger не знает, на каком порту
    // публиковать контейнер, и молча пропускать четвёртый шаг понятнее, чем требовать
    // его от всех. И только для основной ветки: у проекта один деплой, и сборка
    // произвольной ветки не должна подменять работающую версию (итерация 5).
    const isCompose = project.deployMode === 'compose';
    const hasDeploy =
      (isCompose || (project.hostPort != null && project.containerPort != null)) && build.branch === project.branch;
    const stepNames: BuildStepName[] = hasDeploy ? [...SHELL_STEP_NAMES, 'deploy'] : [...SHELL_STEP_NAMES];
    const steps: BuildStep[] = stepNames.map((name) => ({
      name,
      status: 'pending',
      durationMs: null,
      logRef: null,
    }));
    const logPath = join(LOGS_DIR, `${buildId}.log`);
    const logFile = createWriteStream(logPath, { flags: 'a' });

    let repoDir: string | undefined;
    let success = false;

    try {
      if (!project.deployKey) {
        throw new Error('У проекта не настроен deploy-key');
      }
      const privateKey = decryptSecret(project.deployKey.encryptedPrivateKey);
      repoDir = await cloneRepository({
        gitUrl: project.gitUrl,
        branch: build.branch,
        privateKey,
        checkoutBaseDir: WORKDIR_CONTAINER_ROOT,
      });
      const repoDirOnHost = toHostPath(repoDir);
      const env = decryptProjectEnv(project.encryptedEnv);
      const maskSecrets = createSecretMasker(env);
      const writeLine = (line: string) => {
        const masked = maskSecrets(line);
        logFile.write(`${masked}\n`);
        this.gateway.emitLog(buildId, masked);
      };

      const commands: Record<(typeof SHELL_STEP_NAMES)[number], string | null> = {
        install: project.installCmd,
        test: project.testCmd,
        build: project.buildCmd,
      };

      let allPassed = true;
      for (const step of steps) {
        if (!allPassed) {
          step.status = 'skipped';
          this.gateway.emitSteps(buildId, steps);
          continue;
        }

        if (step.name === 'deploy') {
          step.status = 'running';
          step.logRef = logPath;
          this.gateway.emitSteps(buildId, steps);

          const deployStartedAt = Date.now();
          // Маскируется и вывод деплоя: compose подставляет переменные в compose-файл,
          // и сборка образов может их напечатать.
          const deployed = isCompose
            ? await this.composeDeploy.deploy({
                projectId: project.id,
                buildId,
                repoDir,
                composeFile: project.composeFile,
                env,
                onLog: writeLine,
              })
            : await this.deployRunner.deploy({
                projectId: project.id,
                buildId,
                repoDir,
                hostPort: project.hostPort!,
                containerPort: project.containerPort!,
                env,
                onLog: writeLine,
              });
          step.durationMs = Date.now() - deployStartedAt;
          step.status = deployed ? 'success' : 'failed';
          allPassed = deployed;
          this.gateway.emitSteps(buildId, steps);
          continue;
        }

        const command = commands[step.name];
        if (!command) {
          step.status = 'skipped';
          this.gateway.emitSteps(buildId, steps);
          continue;
        }

        step.status = 'running';
        step.logRef = logPath;
        this.gateway.emitSteps(buildId, steps);

        let lineBuffer = '';
        const result = await execute({
          image: BUILDER_IMAGE,
          command,
          workdir: repoDirOnHost,
          timeoutMs: STEP_TIMEOUT_MS,
          memoryLimitMb: MEMORY_LIMIT_MB,
          cpuLimit: CPU_LIMIT,
          network: true,
          env,
          onOutput: (chunk) => {
            lineBuffer += chunk.text;
            const lines = lineBuffer.split('\n');
            lineBuffer = lines.pop() ?? '';
            lines.forEach(writeLine);
          },
        });
        if (lineBuffer) {
          writeLine(lineBuffer);
        }

        step.durationMs = result.durationMs;
        if (result.timedOut) {
          step.status = 'failed';
          logFile.write(`\n[ranger] шаг ${step.name} остановлен по таймауту (${STEP_TIMEOUT_MS}ms)\n`);
          allPassed = false;
        } else if (result.exitCode !== 0) {
          step.status = 'failed';
          allPassed = false;
        } else {
          step.status = 'success';
        }
        this.gateway.emitSteps(buildId, steps);
      }

      success = allPassed;
    } catch (error) {
      this.logger.error(`Сборка ${buildId} упала с ошибкой`, (error as Error).stack);
      for (const step of steps) {
        if (step.status === 'pending' || step.status === 'running') {
          step.status = 'skipped';
        }
      }
      logFile.write(`\n[ranger] сборка упала с ошибкой: ${(error as Error).message}\n`);
    } finally {
      logFile.end();
      if (repoDir) {
        this.persistCheckout(repoDir, project.id);
      }
    }

    await this.updateStatus(buildId, success ? 'success' : 'failed', {
      finishedAt: new Date(),
      steps: steps as unknown as Prisma.InputJsonValue,
    });
    this.gateway.emitStatus(buildId, success ? 'success' : 'failed');
  }

  // Вместо удаления чекаута после сборки — переносим его в стабильную директорию
  // на проект, заменяя предыдущую. Так files-модуль (раздел 5 CLAUDE.md, итерация 2:
  // файловый браузер) всегда может показать содержимое последнего чекаута, а место
  // на диске не растёт бесконечно — хранится только одна, самая свежая копия.
  private persistCheckout(repoDir: string, projectId: string) {
    const stableDir = projectCheckoutDir(projectId);
    rmSync(stableDir, { recursive: true, force: true });
    mkdirSync(join(WORKDIR_CONTAINER_ROOT, 'projects'), { recursive: true });
    renameSync(repoDir, stableDir);
  }

  private updateStatus(
    buildId: string,
    status: 'running' | 'success' | 'failed',
    data: { startedAt?: Date; finishedAt?: Date; steps?: Prisma.InputJsonValue },
  ) {
    return this.prisma.build.update({ where: { id: buildId }, data: { status, ...data } });
  }

  // Сборка в статусе 'running' на момент старта процесса не может быть чьей-то ещё —
  // воркер один на инстанс, а до этой точки инстанс ничего ещё не запускал. Значит,
  // предыдущий процесс умер прямо во время неё (краш, OOM, docker kill), не успев
  // отработать finally в run(): запись осталась висеть в running навсегда, а её
  // чекаут — на диске в WORKDIR_CONTAINER_ROOT. Чиним оба следа при каждом старте.
  //
  // Полагается на то, что BuildQueueService инжектирует этот сервис и по правилам
  // жизненного цикла Nest получает свой onModuleInit только после того, как этот
  // отработает — иначе резюме отправки очередей могло бы запустить новую сборку
  // раньше, чем здесь подчистится место под чекауты.
  private async recoverStuckBuilds() {
    const stuck = await this.prisma.build.findMany({ where: { status: 'running' } });
    for (const build of stuck) {
      const steps = (build.steps as unknown as BuildStep[]).map((step) =>
        step.status === 'running' || step.status === 'pending' ? { ...step, status: 'skipped' as const } : step,
      );
      await this.updateStatus(build.id, 'failed', {
        finishedAt: new Date(),
        steps: steps as unknown as Prisma.InputJsonValue,
      });
      this.gateway.emitSteps(build.id, steps);
      this.gateway.emitStatus(build.id, 'failed');
      this.logger.warn(`Сборка ${build.id} помечена failed при старте — процесс был перезапущен во время её выполнения`);

      const logPath = join(LOGS_DIR, `${build.id}.log`);
      if (existsSync(logPath)) {
        appendFileSync(logPath, '\n[ranger] сборка помечена failed: backend был перезапущен, пока она выполнялась\n');
      }
    }

    for (const entry of readdirSync(WORKDIR_CONTAINER_ROOT)) {
      if (entry.startsWith('repo-')) {
        rmSync(join(WORKDIR_CONTAINER_ROOT, entry), { recursive: true, force: true });
      }
    }
  }
}
