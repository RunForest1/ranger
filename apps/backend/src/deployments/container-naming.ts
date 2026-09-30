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
