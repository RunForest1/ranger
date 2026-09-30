import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// Секреты (deploy-key, переменные окружения проекта) шифруются на уровне приложения —
// не полагаемся на шифрование диска, см. раздел 4/7 CLAUDE.md.
// Формат хранимого значения: iv:authTag:ciphertext, всё в hex.

function getKey(): Buffer {
  const secret = process.env.DEPLOY_KEY_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('DEPLOY_KEY_ENCRYPTION_KEY не задан');
  }
  // Соль осталась от времени, когда шифровался только deploy-key: смена соли сделала бы
  // уже сохранённые ключи нерасшифровываемыми.
  return scryptSync(secret, 'ranger-deploy-key', 32);
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(stored: string): string {
  const key = getKey();
  const [ivHex, authTagHex, cipherHex] = stored.split(':');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(cipherHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}
