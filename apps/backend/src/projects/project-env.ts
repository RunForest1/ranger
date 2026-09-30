import { decryptSecret, encryptSecret } from '../common/secret-crypto';

export type ProjectEnv = Record<string, string>;

// Все значения шифруются одним JSON-объектом, имена хранятся рядом открыто —
// см. комментарий к envKeys/encryptedEnv в schema.prisma.
export function encryptProjectEnv(env: ProjectEnv): { envKeys: string[]; encryptedEnv: string | null } {
  const envKeys = Object.keys(env);
  return { envKeys, encryptedEnv: envKeys.length > 0 ? encryptSecret(JSON.stringify(env)) : null };
}

export function decryptProjectEnv(encryptedEnv: string | null): ProjectEnv {
  return encryptedEnv ? (JSON.parse(decryptSecret(encryptedEnv)) as ProjectEnv) : {};
}
