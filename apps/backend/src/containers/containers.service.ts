import { Injectable } from '@nestjs/common';
import { DockerService } from '../docker/docker.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseProjectIdFromContainerName } from '../deployments/container-naming';

// Раздел 5 CLAUDE.md, итерация 2/3: "все на хосте", не только контейнеры,
// запущенные самим Ranger — поэтому список Docker-демона как есть, без фильтрации.
//
// Группировка: контейнеры, задеплоенные самим Ranger (имя ranger-deploy-<projectId>),
// получают точную группу — реальное имя проекта из БД. Для всех остальных контейнеров
// хоста (в том числе не имеющих отношения к Ranger вообще — соседние docker-compose
// стеки) группа — эвристика по первому слову имени до дефиса: обычный docker compose
// сам называет контейнеры "<project>-<service>-<n>", так что это довольно надёжно
// угадывает, какие контейнеры относятся к одному стеку, даже если Ranger о нём
// ничего не знает.
@Injectable()
export class ContainersService {
  constructor(
    private readonly docker: DockerService,
    private readonly prisma: PrismaService,
  ) {}

  async findAll() {
    const containers = await this.docker.listContainers({ all: true });

    const projectIds = containers
      .map((c) => parseProjectIdFromContainerName(c.Names[0] ?? ''))
      .filter((id): id is string => id != null);
    const projects = projectIds.length
      ? await this.prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } })
      : [];
    const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

    return containers
      .map((container) => {
        const name = container.Names[0]?.replace(/^\//, '') ?? container.Id.slice(0, 12);
        const projectId = parseProjectIdFromContainerName(container.Names[0] ?? '');
        const project = projectId ? { id: projectId, name: projectNameById.get(projectId) ?? projectId } : null;

        return {
          id: container.Id,
          name,
          image: container.Image,
          state: container.State,
          status: container.Status,
          ports: (container.Ports ?? []).map((port) => ({
            privatePort: port.PrivatePort,
            publicPort: port.PublicPort ?? null,
          })),
          project,
          group: project?.name ?? this.heuristicGroup(name),
        };
      })
      .sort((a, b) => {
        const aRunning = a.state === 'running';
        const bRunning = b.state === 'running';
        if (aRunning !== bRunning) {
          return aRunning ? -1 : 1;
        }
        if (!!a.project !== !!b.project) {
          return a.project ? -1 : 1;
        }
        if (a.group !== b.group) {
          return a.group.localeCompare(b.group);
        }
        return a.name.localeCompare(b.name);
      });
  }

  private heuristicGroup(containerName: string): string {
    return containerName.split('-')[0] || containerName;
  }
}
