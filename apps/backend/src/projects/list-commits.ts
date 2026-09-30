import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { gitSshCommand, withTempSshKey } from '../common/temp-ssh-key';

export interface CommitInfo {
  hash: string;
  author: string;
  date: string;
  message: string;
}

// Мелкий shallow-клон во временную папку самого backend-процесса — в отличие от
// клонирования для сборки (clone-repository.ts), сюда не нужен bind-mount в контейнер
// сборки, поэтому DooD-трансляция путей (см. build-runner.service.ts) не требуется:
// git log читается прямо здесь же, каталог удаляется сразу после.
export async function listRecentCommits(params: {
  gitUrl: string;
  branch: string;
  privateKey: string;
  limit?: number;
}): Promise<CommitInfo[]> {
  const limit = params.limit ?? 10;
  const dir = mkdtempSync(join(tmpdir(), 'ranger-commits-'));

  try {
    await withTempSshKey(
      params.privateKey,
      (keyPath) =>
        new Promise<void>((resolve, reject) => {
          const child = spawn(
            'git',
            ['clone', '--branch', params.branch, '--depth', String(limit), '--single-branch', params.gitUrl, dir],
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
              reject(new Error(`git clone завершился с кодом ${code}: ${stderr.trim()}`));
            }
          });
        }),
    );

    const log = await new Promise<string>((resolve, reject) => {
      // \x1f (unit separator) как разделитель полей — не встретится в тексте коммита,
      // в отличие от привычных запятых/пайпов.
      const child = spawn('git', ['log', `-${limit}`, '--pretty=format:%H%x1f%an%x1f%aI%x1f%s'], { cwd: dir });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`git log завершился с кодом ${code}: ${stderr.trim()}`));
        }
      });
    });

    return log
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, author, date, message] = line.split('\x1f');
        return { hash, author, date, message };
      });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
