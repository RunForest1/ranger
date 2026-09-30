import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { generatePassword } from '../users/generate-password';

// Аварийный сброс пароля, когда войти в админку некому (потерян пароль первого
// admin'а из лога). Запускается внутри контейнера backend:
//   docker compose exec backend node dist/cli/reset-password.js admin@example.com
// Обычным скриптом на Prisma, без поднятия Nest-приложения — должен работать,
// даже если сам backend не стартует. Роль не меняет, только пароль.
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Укажите email: node dist/cli/reset-password.js <email>');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`Пользователь ${email} не найден`);
      process.exit(1);
    }
    const password = generatePassword();
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await argon2.hash(password), mustChangePassword: true, disabled: false },
    });
    console.log(`Новый пароль для ${email} (${user.role}): ${password}`);
    console.log('Смените его при первом входе.');
  } finally {
    await prisma.$disconnect();
  }
}

main();
