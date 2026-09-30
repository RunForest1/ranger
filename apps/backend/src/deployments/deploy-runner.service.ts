import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { connect } from 'net';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { DockerService } from '../docker/docker.service';
import { PrismaService } from '../prisma/prisma.service';
import { deployContainerName } from './container-naming';
import { ProjectEnv } from '../projects/project-env';

interface HealthCheckTarget {
  host: string;
  port: number;
}

const IMAGE_TAG_PREFIX = 'ranger-deploy-';
const HEALTH_CHECK_TIMEOUT_MS = 30_000;
const HEALTH_CHECK_INTERVAL_MS = 1_000;

export interface DeployParams {
  projectId: string;
  buildId: string;
  // Путь к чекауту, каким его видит САМ backend-процесс (не хостовый путь) —
  // dockerode.buildImage читает файлы через собственный fs вызывающего процесса
  // и сам упаковывает их в tar-поток для демона, в отличие от createContainer
  // с bind-mount, который демон резолвит относительно хоста (см. build-runner.service.ts).
  repoDir: string;
  hostPort: number;
  containerPort: number;
  env: ProjectEnv;
  onLog: (line: string) => void;
}

// Единственная ответственность: собрать образ из Dockerfile в чекауте, остановить
// предыдущий контейнер проекта, запустить новый, проверить health-check и откатиться
// на предыдущий образ при неудаче — раздел 5 CLAUDE.md, итерация 2.
@Injectable()
export class DeployRunnerService {
  private readonly logger = new Logger(DeployRunnerService.name);

  constructor(
    private readonly docker: DockerService,
    private readonly prisma: PrismaService,
  ) {}

  // Вызывается при удалении проекта (ProjectsService.remove) — иначе задеплоенный
  // контейнер остаётся бесхозным на хосте навсегда (restart-policy unless-stopped
  // переживает даже перезагрузку хоста).
  async teardown(projectId: string) {
    await this.removeContainerIfExists(deployContainerName(projectId));
  }

  async deploy(params: DeployParams): Promise<boolean> {
    const { projectId, buildId, repoDir, hostPort, containerPort, env, onLog } = params;
    const containerName = deployContainerName(projectId);
    const imageTag = `${IMAGE_TAG_PREFIX}${projectId}:${buildId}`;

    if (!existsSync(join(repoDir, 'Dockerfile'))) {
      onLog('[ranger] в корне репозитория нет Dockerfile — деплой невозможен');
      await this.recordDeployment({ projectId, buildId, imageTag, containerId: null, status: 'failed', rolledBack: false });
      return false;
    }

    try {
      onLog(`[ranger] собираю образ ${imageTag}...`);
      await this.buildImage(repoDir, imageTag, onLog);
    } catch (error) {
      // Старый контейнер ещё никто не трогал — падение сборки образа не должно
      // приводить к остановке уже работающего сервиса, откатывать нечего.
      onLog(`[ranger] сборка образа упала: ${(error as Error).message}`);
      await this.recordDeployment({ projectId, buildId, imageTag, containerId: null, status: 'failed', rolledBack: false });
      return false;
    }

    onLog('[ranger] останавливаю предыдущий контейнер (если есть)...');
    await this.removeContainerIfExists(containerName);

    // Backend сам обычно работает в контейнере (docker-compose) — опубликованный
    // hostPort слушает сетевой стек ХОСТА, а не backend-контейнера, и "127.0.0.1"
    // здесь означает "внутри самого backend". Поэтому health-check стучится не в
    // hostPort, а напрямую в задеплоенный контейнер по его имени через ту же
    // docker-сеть, что и backend — для этого деплой-контейнер подключается к тем
    // же сетям, что и сам backend, при создании.
    const sharedNetworks = await this.resolveSharedNetworks();

    try {
      onLog(`[ranger] запускаю новый контейнер на порту ${hostPort}...`);
      const containerId = await this.runContainer(containerName, imageTag, hostPort, containerPort, env, sharedNetworks);

      const target: HealthCheckTarget =
        sharedNetworks.length > 0 ? { host: containerName, port: containerPort } : { host: '127.0.0.1', port: hostPort };
      onLog(`[ranger] жду health-check (${target.host}:${target.port})...`);
      const healthy = await this.waitForPort(target, HEALTH_CHECK_TIMEOUT_MS);
      if (!healthy) {
        throw new Error(`health-check не прошёл за ${HEALTH_CHECK_TIMEOUT_MS / 1000}s`);
      }

      onLog('[ranger] health-check пройден, деплой успешен');
      await this.recordDeployment({ projectId, buildId, imageTag, containerId, status: 'running', rolledBack: false });
      return true;
    } catch (error) {
      onLog(`[ranger] деплой не удался: ${(error as Error).message}`);
      const rolledBackContainerId = await this.tryStartPrevious(
        projectId,
        containerName,
        hostPort,
        containerPort,
        env,
        sharedNetworks,
        onLog,
      );
      await this.recordDeployment({
        projectId,
        buildId,
        imageTag,
        containerId: rolledBackContainerId,
        status: 'failed',
        rolledBack: rolledBackContainerId !== null,
      });
      return false;
    }
  }

  // Ручной откат на произвольную ПРЕЖДЕ УСПЕШНУЮ сборку из истории (раздел 5 CLAUDE.md,
  // итерация 4) — в отличие от tryStartPrevious это не реакция на неудачу текущего
  // деплоя, а самостоятельное действие пользователя. Образ уже собран и лежит в
  // Docker (старые образы никогда не удаляются), поэтому просто переключаем контейнер
  // на него — без сборки заново. Переменные окружения — текущие переменные проекта,
  // а не те, с которыми образ деплоился тогда: старые значения не хранятся.
  async rollbackToDeployment(params: {
    projectId: string;
    deploymentId: string;
    hostPort: number;
    containerPort: number;
    env: ProjectEnv;
    onLog: (line: string) => void;
  }): Promise<boolean> {
    const { projectId, deploymentId, hostPort, containerPort, env, onLog } = params;

    const target = await this.prisma.deployment.findUnique({ where: { id: deploymentId } });
    if (!target || target.projectId !== projectId) {
      throw new BadRequestException('Такого деплоя нет у этого проекта');
    }
    if (target.status !== 'running') {
      throw new BadRequestException('Откатиться можно только на сборку, которая когда-то успешно задеплоилась');
    }
    // Запись могла остаться от времени, когда проект деплоился через compose: образа
    // с таким тегом нет, есть только имя compose-проекта.
    if (!target.imageTag.startsWith(IMAGE_TAG_PREFIX)) {
      throw new BadRequestException('Это был compose-деплой — на него откатиться нельзя');
    }

    const containerName = deployContainerName(projectId);
    const sharedNetworks = await this.resolveSharedNetworks();

    onLog(`[ranger] останавливаю текущий контейнер и запускаю образ ${target.imageTag}...`);
    await this.removeContainerIfExists(containerName);

    try {
      const containerId = await this.runContainer(
        containerName,
        target.imageTag,
        hostPort,
        containerPort,
        env,
        sharedNetworks,
      );
      const healthTarget: HealthCheckTarget =
        sharedNetworks.length > 0 ? { host: containerName, port: containerPort } : { host: '127.0.0.1', port: hostPort };
      onLog(`[ranger] жду health-check (${healthTarget.host}:${healthTarget.port})...`);
      const healthy = await this.waitForPort(healthTarget, HEALTH_CHECK_TIMEOUT_MS);
      if (!healthy) {
        throw new Error(`health-check не прошёл за ${HEALTH_CHECK_TIMEOUT_MS / 1000}s`);
      }
      onLog('[ranger] откат успешен');
      await this.recordDeployment({
        projectId,
        buildId: target.buildId,
        imageTag: target.imageTag,
        containerId,
        status: 'running',
        rolledBack: false,
      });
      return true;
    } catch (error) {
      onLog(`[ranger] откат не удался: ${(error as Error).message}`);
      await this.recordDeployment({
        projectId,
        buildId: target.buildId,
        imageTag: target.imageTag,
        containerId: null,
        status: 'failed',
        rolledBack: false,
      });
      return false;
    }
  }

  // HOSTNAME внутри контейнера по умолчанию — его собственный короткий id, поэтому
  // backend может инспектировать сам себя через Docker API и узнать, к каким сетям
  // он подключён. Пусто, если backend запущен прямо на хосте (см. README — локальная
  // разработка без docker-compose) — тогда сетевой изоляции нет и она не нужна.
  private async resolveSharedNetworks(): Promise<string[]> {
    try {
      const self = await this.docker.getContainer(process.env.HOSTNAME ?? '').inspect();
      return Object.keys(self.NetworkSettings.Networks);
    } catch {
      return [];
    }
  }

  private async buildImage(contextDir: string, tag: string, onLog: (line: string) => void) {
    const entries = readdirSync(contextDir);
    const stream = await this.docker.buildImage({ context: contextDir, src: entries }, { t: tag });
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        (error: Error | null) => (error ? reject(error) : resolve()),
        (event: { stream?: string; error?: string }) => {
          if (event.stream?.trim()) {
            onLog(event.stream.trimEnd());
          }
          if (event.error) {
            onLog(`[ranger] ${event.error}`);
          }
        },
      );
    });
  }

  private async removeContainerIfExists(name: string) {
    const container = this.docker.getContainer(name);
    try {
      await container.stop({ t: 5 });
    } catch {
      // уже остановлен или не существует — не проблема
    }
    try {
      await container.remove({ force: true });
    } catch {
      // не существовал
    }
  }

  private async runContainer(
    name: string,
    imageTag: string,
    hostPort: number,
    containerPort: number,
    env: ProjectEnv,
    networks: string[],
  ): Promise<string> {
    const container = await this.docker.createContainer({
      name,
      Image: imageTag,
      Env: Object.entries(env).map(([key, value]) => `${key}=${value}`),
      ExposedPorts: { [`${containerPort}/tcp`]: {} },
      HostConfig: {
        PortBindings: { [`${containerPort}/tcp`]: [{ HostPort: String(hostPort) }] },
        RestartPolicy: { Name: 'unless-stopped' },
        NetworkMode: networks[0],
      },
    });
    await container.start();
    // Docker позволяет задать только одну сеть при создании (NetworkMode) —
    // остальные подключаются отдельным вызовом уже к запущенному контейнеру.
    for (const network of networks.slice(1)) {
      await this.docker.getNetwork(network).connect({ Container: container.id });
    }
    return container.id;
  }

  private waitForPort(target: HealthCheckTarget, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve) => {
      const attempt = () => {
        const socket = connect({ host: target.host, port: target.port });
        socket.once('connect', () => {
          socket.end();
          resolve(true);
        });
        socket.once('error', () => {
          socket.destroy();
          if (Date.now() >= deadline) {
            resolve(false);
          } else {
            setTimeout(attempt, HEALTH_CHECK_INTERVAL_MS);
          }
        });
      };
      attempt();
    });
  }

  private async tryStartPrevious(
    projectId: string,
    containerName: string,
    hostPort: number,
    containerPort: number,
    env: ProjectEnv,
    networks: string[],
    onLog: (line: string) => void,
  ): Promise<string | null> {
    await this.removeContainerIfExists(containerName);
    // Только деплои одним контейнером: compose-записи (если проект раньше деплоился
    // через compose) не указывают на образ, который можно запустить.
    const previous = await this.prisma.deployment.findFirst({
      where: { projectId, status: 'running', imageTag: { startsWith: IMAGE_TAG_PREFIX } },
      orderBy: { deployedAt: 'desc' },
    });
    if (!previous) {
      onLog('[ranger] предыдущей успешной сборки нет — откатывать не на что');
      return null;
    }
    onLog(`[ranger] откатываюсь на предыдущий образ ${previous.imageTag}`);
    try {
      return await this.runContainer(containerName, previous.imageTag, hostPort, containerPort, env, networks);
    } catch (error) {
      onLog(`[ranger] откат тоже не удался: ${(error as Error).message}`);
      this.logger.error(`Откат деплоя проекта ${projectId} не удался`, (error as Error).stack);
      return null;
    }
  }

  private recordDeployment(data: {
    projectId: string;
    buildId: string;
    imageTag: string;
    containerId: string | null;
    status: string;
    rolledBack: boolean;
  }) {
    return this.prisma.deployment.create({ data });
  }
}
