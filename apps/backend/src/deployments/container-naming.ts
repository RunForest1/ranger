// Общий формат имени контейнера, который Ranger сам создаёт при деплое проекта —
// используется и при создании/остановке (deploy-runner.service.ts), и при
// распознавании "это чей-то проект" в списке контейнеров (containers.service.ts).
const PREFIX = 'ranger-deploy-';

export function deployContainerName(projectId: string): string {
  return `${PREFIX}${projectId}`;
}

export function parseProjectIdFromContainerName(rawName: string): string | null {
  const name = rawName.replace(/^\//, '');
  return name.startsWith(PREFIX) ? name.slice(PREFIX.length) : null;
}

// Имя compose-проекта (`docker compose -p`) — по нему compose помечает свои контейнеры
// меткой com.docker.compose.project, и по ней же список контейнеров узнаёт проект.
const COMPOSE_PREFIX = 'ranger-compose-';
export const COMPOSE_PROJECT_LABEL = 'com.docker.compose.project';

export function composeProjectName(projectId: string): string {
  return `${COMPOSE_PREFIX}${projectId}`;
}

export function parseProjectIdFromComposeProject(label: string | undefined): string | null {
  return label?.startsWith(COMPOSE_PREFIX) ? label.slice(COMPOSE_PREFIX.length) : null;
}
