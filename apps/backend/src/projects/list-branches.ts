import { spawn } from 'child_process';
import { gitSshCommand, withTempSshKey } from '../common/temp-ssh-key';

const TIMEOUT_MS = 15_000;

// Используется на форме создания проекта (ключ ещё не сохранён — приходит из формы)
// и при выборе ветки для запуска сборки (ключ проекта из БД, см. projects.service.ts):
// реальный список веток вместо текстового поля вслепую.
export async function listRemoteBranches(params: { gitUrl: string; privateKey: string }): Promise<string[]> {
  return withTempSshKey(
    params.privateKey,
    (keyPath) =>
      new Promise<string[]>((resolve, reject) => {
        const child = spawn('git', ['ls-remote', '--heads', params.gitUrl], {
          env: {
            ...process.env,
            GIT_SSH_COMMAND: gitSshCommand(keyPath),
            GIT_TERMINAL_PROMPT: '0',
          },
        });

        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error('Проверка репозитория не уложилась в таймаут'));
        }, TIMEOUT_MS);

        child.stdout.on('data', (chunk: Buffer) => {
          stdout += chunk.toString('utf8');
        });
        child.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString('utf8');
        });
        child.on('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          if (code !== 0) {
            reject(new Error(`git ls-remote завершился с кодом ${code}: ${stderr.trim()}`));
            return;
          }
          const branches = stdout
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => line.split('refs/heads/')[1])
            .filter((branch): branch is string => Boolean(branch));
          resolve(branches);
        });
      }),
  );
}
