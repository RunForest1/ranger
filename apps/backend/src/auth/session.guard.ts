import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY, REQUIRED_ROLE_KEY, ROLE_RANK } from './roles.decorator';

// Пользователь читается из БД на каждый запрос, а не берётся из сессии: смена роли,
// отключение и сброс пароля админом должны действовать сразу, а не после того, как
// человек сам перелогинится. Для 2–5 пользователей лишний запрос ничего не стоит.
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('Требуется авторизация');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, disabled: true, mustChangePassword: true },
    });
    if (!user || user.disabled) {
      await new Promise<void>((resolve) => request.session.destroy(() => resolve()));
      throw new UnauthorizedException('Требуется авторизация');
    }

    const targets = [context.getHandler(), context.getClass()];
    const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_CHANGE_KEY, targets);
    if (user.mustChangePassword && !allowPending) {
      throw new ForbiddenException('Сначала смените выданный пароль');
    }

    const requiredRole = this.reflector.getAllAndOverride<UserRole | undefined>(REQUIRED_ROLE_KEY, targets);
    if (requiredRole && ROLE_RANK[user.role] < ROLE_RANK[requiredRole]) {
      throw new ForbiddenException('Недостаточно прав');
    }
    request.userRole = user.role;
    return true;
  }
}
