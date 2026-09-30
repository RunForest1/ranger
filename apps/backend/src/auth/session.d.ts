import 'express-session';

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
