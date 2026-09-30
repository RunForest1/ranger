import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Неверный email или пароль');
    }
    // Проверяется после пароля: о том, что учётка отключена, узнаёт только тот,
    // кто знает от неё пароль, а не любой перебирающий email.
    if (user.disabled) {
      throw new UnauthorizedException('Учётная запись отключена администратором');
    }
    return user;
  }

  me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, role: true, mustChangePassword: true },
    });
  }

  // Раздел 4/7 CLAUDE.md: перед входом в терминал — отдельная повторная
  // аутентификация, не полагающаяся на то, что сессия просто ещё не истекла.
  async verifyPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Неверный пароль');
    }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    await this.verifyPassword(userId, currentPassword);
    if (newPassword === currentPassword) {
      throw new BadRequestException('Новый пароль должен отличаться от текущего');
    }
    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } });
  }
}
