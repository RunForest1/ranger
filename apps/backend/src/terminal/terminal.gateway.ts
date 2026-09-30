import { OnGatewayDisconnect, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { existsSync } from 'fs';
import { Duplex } from 'stream';
import { DockerService } from '../docker/docker.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { deployContainerName } from '../deployments/container-naming';
import { projectCheckoutDir, toHostPath } from '../builds/workdir-paths';
import { SocketRequestWithSession } from '../common/session-io-adapter';

// Раздел 4/7 и 5 (итерация 4) CLAUDE.md: терминал — вход в шелл конкретного
// контейнера (если проект задеплоен) или рабочей директории проекта (её последний
// чекаут), НЕ в хост-шелл напрямую. Отдельный namespace от остальных гейтвеев —
// свои события ('start'/'input'/'resize'/'stop'), не пересекающиеся с их 'subscribe'.
type TerminalTarget = 'container' | 'workdir';

const BUILDER_IMAGE = 'ranger-builder:latest';
const SHELL_CMD = ['/bin/sh', '-c', 'exec bash 2>/dev/null || exec sh'];
const MEMORY_LIMIT_MB = 512;
const CPU_LIMIT = 1;
const PIDS_LIMIT = 256;

// Повторная аутентификация (POST /auth/reauth) истекает быстрее обычной сессии,
// потому что открывает прямой шелл-доступ, а не просто чтение данных через API.
const REAUTH_TTL_MS = 5 * 60 * 1000;
// Жёсткий потолок на одну сессию независимо от активности — то же требование
// "обязательный таймаут", что и для шагов сборки (раздел 7 CLAUDE.md).
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// Клиенту уходит код, а не текст: строки UI проходят через словарь локализации
// на фронтенде (раздел 6/8 CLAUDE.md), а не приходят готовыми с бэкенда на одном языке.
type TerminalErrorCode = 'forbidden' | 'project_not_found' | 'not_deployed' | 'container_not_running' | 'no_checkout';
type CloseReason = 'timeout' | 'stream_closed';

class TerminalStartError extends Error {
  constructor(readonly code: TerminalErrorCode) {
    super(code);
  }
}

interface ShellHandle {
  stream: Duplex;
  resize: (size: { cols: number; rows: number }) => void;
  cleanup: () => Promise<void>;
}

interface ActiveSession extends ShellHandle {
  client: Socket;
  timeout: NodeJS.Timeout;
}

@WebSocketGateway({ namespace: 'terminal', cors: { origin: true, credentials: true } })
export class TerminalGateway implements OnGatewayDisconnect {
  private readonly activeSessions = new Map<string, ActiveSession>();

  constructor(
    private readonly docker: DockerService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  handleDisconnect(client: Socket) {
    this.close(client);
  }

  // Всё тело в try: исключение, вылетевшее из обработчика сокета, попало бы в
  // глобальный AllExceptionsFilter, который рассчитан только на HTTP-контекст.
  @SubscribeMessage('start')
  async onStart(client: Socket, payload: { projectId: string; target: TerminalTarget }) {
    await this.close(client);

    try {
      const session = await this.reloadSession(client);
      const user = session?.userId
        ? await this.prisma.user.findUnique({ where: { id: session.userId } })
        : null;
      if (!session || !user || user.role !== 'admin' || user.disabled || user.mustChangePassword) {
        client.emit('failure', { code: 'forbidden' });
        client.disconnect(true);
        return;
      }
      if (!session.terminalReauthAt || Date.now() - session.terminalReauthAt > REAUTH_TTL_MS) {
        client.emit('reauth_required');
        return;
      }

      const project = await this.prisma.project.findUnique({ where: { id: payload.projectId } });
      if (!project) {
        throw new TerminalStartError('project_not_found');
      }

      // До запуска шелла, а не после: попытка входа попадает в журнал, даже если
      // сам запуск упадёт, и шелл не откроется, если запись в журнал не удалась.
      await this.audit.record(user.id, 'open_terminal', `${project.id}:${payload.target}`);

      const handle =
        payload.target === 'container'
          ? await this.startInContainer(project.id)
          : await this.startInWorkdir(project.id);

      // Пока контейнер поднимался, клиент мог отключиться или прислать второй 'start' —
      // тогда эта сессия уже никому не нужна, и без проверки жила бы до таймаута.
      if (client.disconnected || this.activeSessions.has(client.id)) {
        await handle.cleanup();
        return;
      }
      this.register(client, handle);
      client.emit('ready');
    } catch (error) {
      if (error instanceof TerminalStartError) {
        client.emit('failure', { code: error.code });
      } else {
        // Неожиданные ошибки (нет образа, демон недоступен) — исходное сообщение как
        // деталь, чтобы причина была видна в UI без захода в логи (раздел 8 CLAUDE.md).
        client.emit('failure', { code: 'start_failed', detail: (error as Error).message });
      }
    }
  }

  @SubscribeMessage('input')
  onInput(client: Socket, data: unknown) {
    if (typeof data === 'string') {
      this.activeSessions.get(client.id)?.stream.write(data);
    }
  }

  @SubscribeMessage('resize')
  onResize(client: Socket, size: { cols: number; rows: number }) {
    this.activeSessions.get(client.id)?.resize(size);
  }

  @SubscribeMessage('stop')
  onStop(client: Socket) {
    this.close(client);
  }

  // Сессия в socket.request — снимок на момент подключения. Перечитываем её из
  // хранилища на каждый 'start', иначе сокет не увидит ни только что пройденный
  // reauth, ни logout, сделанный после подключения. Роль — из БД, как в session.guard.ts.
  private reloadSession(client: Socket) {
    const request = client.request as SocketRequestWithSession;
    return new Promise<SocketRequestWithSession['session'] | null>((resolve) => {
      if (!request.session) {
        resolve(null);
        return;
      }
      request.session.reload((err) => resolve(err ? null : request.session ?? null));
    });
  }

  private register(client: Socket, handle: ShellHandle) {
    const session: ActiveSession = {
      ...handle,
      client,
      timeout: setTimeout(() => this.close(client, 'timeout'), SESSION_TIMEOUT_MS),
    };
    this.activeSessions.set(client.id, session);

    handle.stream.on('data', (chunk: Buffer) => client.emit('output', chunk.toString('utf8')));
    // Без обработчика 'error' необработанное событие на стриме валит весь процесс.
    handle.stream.on('error', () => this.close(client, 'stream_closed'));
    handle.stream.on('close', () => this.close(client, 'stream_closed'));
  }

  // Удаляем сессию из карты до cleanup(): destroy() внутри него порождает 'close'
  // на стриме, и повторный вызов должен стать no-op, а не отправить клиенту вторую,
  // уже неверную причину закрытия поверх настоящей (например, 'timeout').
  private async close(client: Socket, reason?: CloseReason) {
    const active = this.activeSessions.get(client.id);
    if (!active) {
      return;
    }
    this.activeSessions.delete(client.id);
    clearTimeout(active.timeout);
    if (reason) {
      client.emit('closed', reason);
    }
    await active.cleanup();
  }

  private async startInContainer(projectId: string): Promise<ShellHandle> {
    const container = this.docker.getContainer(deployContainerName(projectId));
    let info;
    try {
      info = await container.inspect();
    } catch {
      throw new TerminalStartError('not_deployed');
    }
    if (!info.State.Running) {
      throw new TerminalStartError('container_not_running');
    }

    const exec = await container.exec({
      Cmd: SHELL_CMD,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
    });
    const stream = await exec.start({ hijack: true, stdin: true });

    return {
      stream,
      resize: ({ cols, rows }) => {
        exec.resize({ h: rows, w: cols }).catch(() => undefined);
      },
      cleanup: async () => {
        stream.destroy();
      },
    };
  }

  private async startInWorkdir(projectId: string): Promise<ShellHandle> {
    const checkoutDir = projectCheckoutDir(projectId);
    if (!existsSync(checkoutDir)) {
      throw new TerminalStartError('no_checkout');
    }

    const container = await this.docker.createContainer({
      Image: BUILDER_IMAGE,
      Cmd: SHELL_CMD,
      Tty: true,
      OpenStdin: true,
      StdinOnce: false,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: '/workspace',
      HostConfig: {
        Binds: [`${toHostPath(checkoutDir)}:/workspace`],
        Memory: MEMORY_LIMIT_MB * 1024 * 1024,
        NanoCpus: CPU_LIMIT * 1_000_000_000,
        PidsLimit: PIDS_LIMIT,
        NetworkMode: 'none',
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        AutoRemove: true,
      },
    });
    // AutoRemove срабатывает только после остановки запущенного контейнера —
    // созданный, но так и не запущенный контейнер остался бы на хосте навсегда.
    const removeContainer = () => container.remove({ force: true }).catch(() => undefined);

    let stream: Duplex;
    try {
      // attach до start — иначе можно потерять первый вывод шелла (приглашение).
      stream = (await container.attach({
        stream: true,
        stdin: true,
        stdout: true,
        stderr: true,
        hijack: true,
      })) as unknown as Duplex;
      await container.start();
    } catch (error) {
      await removeContainer();
      throw error;
    }

    return {
      stream,
      resize: ({ cols, rows }) => {
        container.resize({ h: rows, w: cols }).catch(() => undefined);
      },
      cleanup: async () => {
        stream.destroy();
        await container.stop({ t: 2 }).catch(() => undefined);
        await removeContainer();
      },
    };
  }
}
