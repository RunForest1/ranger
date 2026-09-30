import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { generatePassword } from './generate-password';

// Регистрации нет (итерация 5): на пустой базе создаётся первый admin с email из
// ADMIN_EMAIL, сгенерированный пароль один раз печатается в лог контейнера
// (docker compose logs backend). Если в базе уже есть хоть один пользователь —
// ничего не делает, так что перезапуски и смена ADMIN_EMAIL потом ни на что не влияют.
// Потерянный пароль сбрасывается командой dist/cli/reset-password.js (см. README).
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger('AdminBootstrap');

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    if ((await this.prisma.user.count()) > 0) {
      return;
    }

    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (!email) {
      this.logger.warn('В базе нет пользователей, а ADMIN_EMAIL не задан — войти будет некому. Задайте ADMIN_EMAIL в .env и перезапустите backend.');
      return;
    }

    const password = generatePassword();
    await this.prisma.user.create({
      data: { email, role: 'admin', passwordHash: await argon2.hash(password), mustChangePassword: true },
    });
    this.logger.log('==================================================');
    this.logger.log(`Создан первый администратор: ${email}`);
    this.logger.log(`Пароль: ${password}`);
    this.logger.log('Смените его при первом входе — он показан только сейчас.');
    this.logger.log('==================================================');
  }
}
