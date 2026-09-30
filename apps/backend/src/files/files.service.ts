import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'fs';
import { join, normalize, sep } from 'path';
import { projectCheckoutDir } from '../builds/workdir-paths';

const MAX_READABLE_FILE_BYTES = 1_000_000;

export interface FileEntry {
  name: string;
  type: 'file' | 'dir';
  size: number;
  modifiedAt: string;
}

export interface FileContent {
  size: number;
  binary: boolean;
  tooLarge: boolean;
  content: string | null;
}

// Read-only браузер последнего чекаута проекта (см. persistCheckout в
// build-runner.service.ts) — раздел 5 CLAUDE.md, итерация 2. Никакого письма,
// никакого доступа за пределы чекаута этого конкретного проекта.
@Injectable()
export class FilesService {
  list(projectId: string, relativePath: string): FileEntry[] {
    const dir = this.resolvePath(projectId, relativePath);
    if (!statSync(dir).isDirectory()) {
      throw new BadRequestException('Указанный путь — не директория');
    }
    return readdirSync(dir, { withFileTypes: true })
      .map((entry) => {
        const stats = statSync(join(dir, entry.name));
        return {
          name: entry.name,
          type: stats.isDirectory() ? ('dir' as const) : ('file' as const),
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => (a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name)));
  }

  readFile(projectId: string, relativePath: string): FileContent {
    const filePath = this.resolvePath(projectId, relativePath);
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      throw new BadRequestException('Указанный путь — не файл');
    }
    if (stats.size > MAX_READABLE_FILE_BYTES) {
      return { size: stats.size, binary: false, tooLarge: true, content: null };
    }
    const buffer = readFileSync(filePath);
    const binary = buffer.subarray(0, 8000).includes(0);
    return { size: stats.size, binary, tooLarge: false, content: binary ? null : buffer.toString('utf8') };
  }

  // Защита от выхода за пределы чекаута — в том числе через симлинк, который может
  // содержать сам репозиторий (он полностью под контролем того, кто владеет git-
  // удалённым концом, а не только автора deploy-key). Сравнение делается по
  // реальному (resolved) пути, не по лексически построенному.
  private resolvePath(projectId: string, relativePath: string): string {
    const baseDir = projectCheckoutDir(projectId);
    if (!existsSync(baseDir)) {
      throw new NotFoundException('У проекта ещё нет сохранённого чекаута — дождитесь первой сборки');
    }
    const requested = normalize(join(baseDir, relativePath || '.'));
    if (!existsSync(requested)) {
      throw new NotFoundException('Файл или директория не найдены');
    }
    const realBase = realpathSync(baseDir);
    const real = realpathSync(requested);
    if (real !== realBase && !real.startsWith(realBase + sep)) {
      throw new BadRequestException('Путь вне рабочей директории проекта');
    }
    return real;
  }
}
