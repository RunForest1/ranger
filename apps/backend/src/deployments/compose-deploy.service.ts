import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync } from 'fs';
import { join, sep } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectEnv } from '../projects/project-env';
import { composeDeploysDir, workdirPathsMatch } from '../builds/workdir-paths';
import { composeProjectName } from './container-naming';

// Потолок на весь `up` вместе со сборкой образов — как таймаут шага сборки: зависший
// compose не должен навсегда занимать очередь проекта.
const COMPOSE_TIMEOUT_MS = 20 * 60 * 1000;
// С запасом на сервисы, которые на старте делают долгую работу (миграции, импорт
// данных) и становятся healthy не сразу.
const WAIT_TIMEOUT_S = 300;
const FAILURE_LOG_LINES = 50;
// Текущий деплой и предыдущий: контейнеры предыдущего ещё могут ссылаться на свою
// директорию, пока compose не пересоздаст их.
const KEPT_DEPLOY_DIRS = 2;

export interface ComposeDeployParams {
  projectId: string;
  buildId: string;
  // Путь к чекауту, каким его видит backend (для compose он совпадает с хостовым).
  repoDir: string;
  composeFile: string;
  env: ProjectEnv;
  onLog: (line: string) => void;
}

// Деплой проекта целиком через `docker compose up` по файлу из репозитория.
// Через CLI, а не dockerode: compose — это отдельная программа поверх Docker API,
// в dockerode её нет. Отката нет (решение для первой версии): при неудаче сервисы
// остаются в том состоянии, в каком их оставил compose, причина — в логе сборки.
@Injectable()
export class ComposeDeployService {
  private readonly logger = new Logger(ComposeDeployService.name);

  constructor(private readonly prisma: PrismaService) {}

  async deploy(params: ComposeDeployParams): Promise<boolean> {
    const { projectId, buildId, repoDir, composeFile, env, onLog } = params;

    if (!workdirPathsMatch()) {
      onLog(
        '[ranger] compose-деплой требует, чтобы рабочая директория была смонтирована в backend по тому же ' +
          'пути, что и на хосте (BUILD_WORKDIR_CONTAINER_PATH = BUILD_WORKDIR_HOST_PATH) — см. README',
      );
      await this.recordDeployment(projectId, buildId, 'failed');
      return false;
    }

    const deployDir = join(composeDeploysDir(projectId), buildId);
    rmSync(deployDir, { recursive: true, force: true });
    mkdirSync(composeDeploysDir(projectId), { recursive: true });
    cpSync(repoDir, deployDir, { recursive: true, verbatimSymlinks: true });

    // realpath, а не только existsSync: compose-файл может оказаться симлинком из
    // репозитория, указывающим за пределы чекаута.
    const composePath = join(deployDir, composeFile);
    if (!existsSync(composePath) || !realpathSync(composePath).startsWith(realpathSync(deployDir) + sep)) {
      onLog(`[ranger] в репозитории нет ${composeFile} — деплой невозможен`);
      await this.recordDeployment(projectId, buildId, 'failed');
      return false;
    }

    onLog(`[ranger] docker compose up по ${composeFile}...`);
    const exitCode = await this.runCompose(
      [
        '-f',
        composeFile,
        'up',
        '-d',
        '--build',
        '--remove-orphans',
        '--wait',
        '--wait-timeout',
        String(WAIT_TIMEOUT_S),
      ],
      { cwd: deployDir, projectId, env, onLog },
    );

    if (exitCode !== 0) {
      onLog(
        `[ranger] docker compose завершился с кодом ${exitCode ?? 'нет (остановлен)'} — деплой не удался. ` +
          'Сервисы оставлены как есть: отката для compose-деплоя нет.',
      );
      // `up` сообщает только «unhealthy» или «exited», а причина — в логах самого
      // сервиса. Без них её пришлось бы искать через docker logs руками (раздел 8 CLAUDE.md).
      const composeOptions = { cwd: deployDir, projectId, env, onLog };
      onLog('[ranger] состояние сервисов:');
      await this.runCompose(['-f', composeFile, 'ps', '-a'], composeOptions);
      onLog(`[ranger] последние ${FAILURE_LOG_LINES} строк логов каждого сервиса:`);
      await this.runCompose(['-f', composeFile, 'logs', '--no-color', '--tail', String(FAILURE_LOG_LINES)], composeOptions);
      await this.recordDeployment(projectId, buildId, 'failed');
      return false;
    }

    onLog('[ranger] все сервисы запущены, деплой успешен');
    await this.recordDeployment(projectId, buildId, 'running');
    this.pruneDeployDirs(projectId, buildId);
    return true;
  }

  // Удаление проекта или смена режима деплоя. Именованные volume'ы не удаляются
  // (без -v): в них могут лежать данные, которые переживают сам проект в Ranger.
  async teardown(projectId: string) {
    await this.runCompose(['down', '--remove-orphans'], {
      // Без compose-файла: `down` находит контейнеры по имени проекта (-p). Корень —
      // чтобы случайный compose-файл в cwd процесса не подхватился вместо этого.
      cwd: '/',
      projectId,
      env: {},
      onLog: (line) => this.logger.log(line),
    });
    rmSync(composeDeploysDir(projectId), { recursive: true, force: true });
  }

  private runCompose(
    args: string[],
    options: { cwd: string; projectId: string; env: ProjectEnv; onLog: (line: string) => void },
  ): Promise<number | null> {
    const { cwd, projectId, env, onLog } = options;
    // Не process.env целиком: compose подставляет переменные окружения в compose-файл
    // (${VAR}), и файл из репозитория мог бы вытащить секреты самого Ranger
    // (DEPLOY_KEY_ENCRYPTION_KEY, SESSION_SECRET, DATABASE_URL) в свой контейнер.
    const childEnv: Record<string, string> = { ...env };
    for (const key of ['PATH', 'HOME', 'DOCKER_HOST']) {
      const value = process.env[key];
      if (value) {
        childEnv[key] = value;
      }
    }

    return new Promise((resolve) => {
      const child = spawn('docker', ['compose', '--progress', 'plain', '-p', composeProjectName(projectId), ...args], {
        cwd,
        env: childEnv,
      });

      const timeout = setTimeout(() => {
        onLog(`[ranger] docker compose остановлен по таймауту (${COMPOSE_TIMEOUT_MS / 60000} мин)`);
        child.kill('SIGKILL');
      }, COMPOSE_TIMEOUT_MS);

      const forwardLines = () => {
        let buffer = '';
        return {
          push: (chunk: Buffer) => {
            buffer += chunk.toString('utf8');
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            lines.forEach(onLog);
          },
          flush: () => {
            if (buffer) {
              onLog(buffer);
            }
          },
        };
      };
      const stdout = forwardLines();
      const stderr = forwardLines();
      child.stdout.on('data', stdout.push);
      child.stderr.on('data', stderr.push);

      child.once('error', (error) => {
        clearTimeout(timeout);
        onLog(`[ranger] не удалось запустить docker compose: ${error.message}`);
        resolve(null);
      });
      child.once('close', (code) => {
        clearTimeout(timeout);
        stdout.flush();
        stderr.flush();
        resolve(code);
      });
    });
  }

  private pruneDeployDirs(projectId: string, currentBuildId: string) {
    const root = composeDeploysDir(projectId);
    const stale = readdirSync(root)
      .filter((name) => name !== currentBuildId)
      .map((name) => ({ name, mtime: statSync(join(root, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(KEPT_DEPLOY_DIRS - 1);
    for (const { name } of stale) {
      rmSync(join(root, name), { recursive: true, force: true });
    }
  }

  // imageTag для compose — имя compose-проекта: образов несколько, а поле обязательное.
  private recordDeployment(projectId: string, buildId: string, status: 'running' | 'failed') {
    return this.prisma.deployment.create({
      data: { projectId, buildId, imageTag: composeProjectName(projectId), containerId: null, status, rolledBack: false },
    });
  }
}
