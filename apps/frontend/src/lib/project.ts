import type { Project } from '../types';

// Совпадает с условием шага deploy на бэкенде (build-runner.service.ts), без учёта
// ветки: compose-проект деплоится всегда, одиночный контейнер — только с портами.
export function hasDeploy(project: Project): boolean {
  return project.deployMode === 'compose' || (project.containerPort != null && project.hostPort != null);
}
