import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Общий helper для clone-repository.ts и list-branches.ts — оба должны выполнить
// git-команду с приватным ключом, который нигде не должен осесть на диске дольше
// самой операции (раздел 7 CLAUDE.md).
export async function withTempSshKey<T>(privateKey: string, fn: (keyPath: string) => Promise<T>): Promise<T> {
  const keyDir = mkdtempSync(join(tmpdir(), 'ranger-key-'));
  const keyPath = join(keyDir, 'id');
  writeFileSync(keyPath, privateKey.endsWith('\n') ? privateKey : `${privateKey}\n`, { mode: 0o600 });
  try {
    return await fn(keyPath);
  } finally {
    rmSync(keyDir, { recursive: true, force: true });
  }
}

export function gitSshCommand(keyPath: string): string {
  return `ssh -i ${keyPath} -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes`;
}
