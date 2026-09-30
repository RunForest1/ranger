import 'express-session';
import { UserRole } from '@prisma/client';

// В сессии только id — роль и прочее состояние пользователя читаются из БД на каждый
// запрос (session.guard.ts), иначе смена роли админом не действовала бы до перелогина.
declare module 'express-session' {
  interface SessionData {
    userId: string;
    // Раздел 4/7 CLAUDE.md: терминал требует отдельной повторной аутентификации
    // перед входом, отдельно от обычной сессии — метка времени последнего успешного
    // подтверждения пароля, проверяемая с TTL в terminal.gateway.ts.
    terminalReauthAt?: number;
  }
}

// Роль текущего запроса, которую SessionGuard и так читает из БД — не хранится в сессии
// (см. комментарий выше), живёт только в рамках одного HTTP-запроса.
declare global {
  namespace Express {
    interface Request {
      userRole?: UserRole;
    }
  }
}
