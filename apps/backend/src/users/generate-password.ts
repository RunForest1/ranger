import { randomBytes } from 'crypto';

// 16 hex-символов (8 случайных байт) — решение итерации 5. Такой пароль всегда
// временный: пользователь обязан сменить его при первом входе (mustChangePassword).
export function generatePassword(): string {
  return randomBytes(8).toString('hex');
}
