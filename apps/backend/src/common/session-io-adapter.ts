import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Session, SessionData } from 'express-session';

// Взято минимальной сигнатурой, а не типом express.RequestHandler напрямую: в
// проекте одновременно установлены @types/express 4.x (через зависимости
// express-session/connect-pg-simple) и 5.x (через сам express) — они несовместимы
// на уровне типов, хотя рантайм один и тот же. Мидлварь вызывается по факту как
// обычная функция (req, res, next), большего здесь не нужно.
type NodeMiddleware = (req: unknown, res: unknown, next: (err?: unknown) => void) => void;

// session — снимок на момент handshake: изменения, сделанные позже HTTP-запросами
// (reauth, logout), сокет увидит только после session.reload().
export interface SocketRequestWithSession {
  session?: Session & Partial<SessionData>;
}

// Nest-гейтвеи по умолчанию не видят express-сессию: socket.io обрабатывает
// handshake отдельно от HTTP-миддлварей, которые app.use() навешивает на
// Express-приложение. Этот адаптер прокидывает сессию в socket.request и
// не пускает в сокет без логина — раздел 7 CLAUDE.md: логи сборок, логи
// контейнеров и метрики не должны быть доступны анонимно, так же как их
// HTTP-эндпоинты под SessionGuard.
//
// Регистрация в create(), а не в createIOServer(): server.use() покрывает
// только namespace "/", а Nest вызывает create() ровно один раз на каждый
// namespace гейтвея (см. socket-server-provider.js в @nestjs/websockets) —
// так проверка висит на всех namespace без списка их имён здесь.
//
// res — пустой объект: express-session лишь оборачивает res.writeHead/res.end,
// а эти обёртки на handshake сокета никогда не вызываются. Сессию здесь только
// читаем; записывается она HTTP-запросами (login, reauth).
export class SessionIoAdapter extends IoAdapter {
  // canConnect — та же проверка пользователя по БД, что в session.guard.ts
  // (не отключён, не должен сменить выданный пароль): сессия хранит только id.
  constructor(
    app: INestApplicationContext,
    private readonly sessionMiddleware: NodeMiddleware,
    private readonly canConnect: (userId: string) => Promise<boolean>,
  ) {
    super(app);
  }

  // Типы берутся из сигнатуры IoAdapter, а не импортом из socket.io: у Nest своя
  // копия socket.io (4.8.1) рядом с нашей (4.8.3), и их типы несовместимы между собой.
  create(port: number, options?: Parameters<IoAdapter['create']>[1]): ReturnType<IoAdapter['create']> {
    const target = super.create(port, options);
    target.use((socket, next) => {
      this.sessionMiddleware(socket.request, {}, (err) => {
        if (err) {
          next(err as Error);
          return;
        }
        const userId = (socket.request as SocketRequestWithSession).session?.userId;
        if (!userId) {
          next(new Error('unauthorized'));
          return;
        }
        this.canConnect(userId).then(
          (allowed) => next(allowed ? undefined : new Error('unauthorized')),
          (error: Error) => next(error),
        );
      });
    });
    return target;
  }
}
