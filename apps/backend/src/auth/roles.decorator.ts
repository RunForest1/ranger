import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const REQUIRED_ROLE_KEY = 'requiredRole';
export const ALLOW_PENDING_PASSWORD_CHANGE_KEY = 'allowPendingPasswordChange';

// Роли упорядочены: admin может всё, что operator, operator — всё, что viewer.
// Без декоратора маршрут под SessionGuard доступен любой роли (просмотр).
export const ROLE_RANK: Record<UserRole, number> = { viewer: 0, operator: 1, admin: 2 };

export const RequireRole = (role: UserRole) => SetMetadata(REQUIRED_ROLE_KEY, role);

// Маршруты, доступные пользователю со сгенерированным паролем до его смены:
// узнать о себе, сменить пароль, выйти. Всё остальное — 403, пока пароль не сменён.
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, true);
