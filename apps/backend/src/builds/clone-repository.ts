import { spawn } from 'child_process';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { gitSshCommand, withTempSshKey } from '../common/temp-ssh-key';

// Git-операции — системным git через shell, не своей git-библиотекой (раздел 3 CLAUDE.md).
// spawn с массивом аргументов (не shell:true с конкатенацией строки) — gitUrl/branch
// приходят из пользовательских данных проекта, и это защищает от command injection.
//
// checkoutBaseDir — директория ПОД ОБЩИМ volume backend/докер-хоста, не os.tmpdir().
// Backend ходит в Docker через сокет хоста, поэтому путь, который дальше передаётся
// в sandbox-executor как workdir для монтирования в контейнер сборки, обязан быть
// путём демона на хосте — см. build-runner.service.ts и раздел 7 CLAUDE.md про сокет.
export async function cloneRepository(params: {
  gitUrl: string;
  branch: string;
  privateKey: string;
  checkoutBaseDir: string;
}): Promise<string> {
  const repoDir = mkdtempSync(join(params.checkoutBaseDir, 'repo-'));

  await withTempSshKey(params.privateKey, (keyPath) => {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(
        'git',
        ['clone', '--branch', params.branch, '--depth', '1', params.gitUrl, repoDir],
        {
          env: {
            ...process.env,
            GIT_SSH_COMMAND: gitSshCommand(keyPath),
            GIT_TERMINAL_PROMPT: '0',
          },
        },
      );
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          // ssh при ошибке печатает путь к файлу ключа, не его содержимое — это безопасно
          // логировать (раздел 7 CLAUDE.md: сам ключ в лог попадать не должен).
          reject(new Error(`git clone завершился с кодом ${code}: ${stderr.trim()}`));
        }
      });
    });
  });

  return repoDir;
}
