import { join } from 'path';

// Путь чекаута, каким его видит backend-контейнер — общий корень для build-runner
// (временные "repo-*" на время сборки, см. clone-repository.ts) и files-модуля
// (стабильная копия последнего чекаута на проект, см. persistCheckout в
// build-runner.service.ts). Вынесено сюда, а не оставлено локальной константой в
// build-runner.service.ts, потому что теперь используется в двух независимых модулях.
export const WORKDIR_CONTAINER_ROOT = process.env.BUILD_WORKDIR_CONTAINER_PATH ?? '/data/build-workdir';

// Тот же путь, каким его видит Docker-демон на хосте (через смонтированный сокет) —
// нужен везде, где backend просит демон о bind-mount (build-runner.service.ts,
// terminal.gateway.ts), потому что демон резолвит такие пути относительно хоста,
// не относительно самого backend-контейнера.
const WORKDIR_HOST_ROOT = process.env.BUILD_WORKDIR_HOST_PATH;

export function projectCheckoutDir(projectId: string): string {
  return join(WORKDIR_CONTAINER_ROOT, 'projects', projectId);
}

export function toHostPath(containerPath: string): string {
  if (!WORKDIR_HOST_ROOT) {
    throw new Error(
      'BUILD_WORKDIR_HOST_PATH не задан: без него bind-mount чекаута резолвится Docker-демоном на хосте неверно.',
    );
  }
  return containerPath.replace(WORKDIR_CONTAINER_ROOT, WORKDIR_HOST_ROOT);
}
