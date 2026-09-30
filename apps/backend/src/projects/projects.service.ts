import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DeployMode, Prisma, UserRole } from '@prisma/client';
import cron from 'node-cron';
import { PrismaService } from '../prisma/prisma.service';
import { CronTriggerService } from '../builds/cron-trigger.service';
import { DeployRunnerService } from '../deployments/deploy-runner.service';
import { ComposeDeployService } from '../deployments/compose-deploy.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { decryptSecret, encryptSecret } from '../common/secret-crypto';
import { listRecentCommits } from './list-commits';
import { listRemoteBranches } from './list-branches';
import { EnvVariableDto } from './dto/set-project-env.dto';
import { ProjectEnv, decryptProjectEnv, encryptProjectEnv } from './project-env';

// deployKey.encryptedPrivateKey и encryptedEnv намеренно не выбираются — см. раздел 4 CLAUDE.md:
// секрет никогда не должен попадать в API-ответ целиком.
const projectSelect = {
  id: true,
  name: true,
  gitUrl: true,
  branch: true,
  ownerId: true,
  installCmd: true,
  testCmd: true,
  buildCmd: true,
  triggerMode: true,
  cronExpr: true,
  containerPort: true,
  hostPort: true,
  isPublic: true,
  deployMode: true,
  composeFile: true,
  envKeys: true,
  deployKey: { select: { id: true } },
} satisfies Prisma.ProjectSelect;

// Проект без единой команды ничего не делает — сборка проходит "успешно", не выполнив
// ни шагу. Хотя бы одна из трёх обязана быть непустой.
function assertHasAnyCommand(installCmd?: string | null, testCmd?: string | null, buildCmd?: string | null) {
  if (!installCmd?.trim() && !testCmd?.trim() && !buildCmd?.trim()) {
    throw new BadRequestException('Укажите хотя бы одну команду — install, test или build');
  }
}

// Оба порта деплоя заданы вместе либо не заданы вовсе — частичная настройка ничего
// не значит для build-runner (см. раздел 5 CLAUDE.md, итерация 2).
function assertDeployPortsConsistent(containerPort?: number | null, hostPort?: number | null) {
  if ((containerPort == null) !== (hostPort == null)) {
    throw new BadRequestException('Порт контейнера и порт хоста для деплоя нужно указать вместе');
  }
}

// Переменная без value — «оставить как было» (см. EnvVariableDto). Имена, которых нет
// в списке, удаляются: клиент всегда присылает полный список переменных.
function mergeEnv(current: ProjectEnv, variables: EnvVariableDto[]): ProjectEnv {
  const next: ProjectEnv = {};
  for (const { key, value } of variables) {
    if (key in next) {
      throw new BadRequestException(`Переменная ${key} указана дважды`);
    }
    if (value === undefined && !(key in current)) {
      throw new BadRequestException(`Не задано значение переменной ${key}`);
    }
    next[key] = value ?? current[key];
  }
  return next;
}

function assertValidCron(triggerMode: string, cronExpr?: string | null) {
  if (triggerMode === 'cron' && !cron.validate(cronExpr ?? '')) {
    throw new BadRequestException('Некорректное cron-выражение');
  }
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cronTrigger: CronTriggerService,
    private readonly deployRunner: DeployRunnerService,
    private readonly composeDeploy: ComposeDeployService,
  ) {}

  // Все проекты, а не только свои: доступ к проектам разграничивается ролью, а не
  // владельцем (итерация 5). ownerId остаётся — это просто автор проекта.
  findAll() {
    return this.prisma.project.findMany({ orderBy: { name: 'asc' }, select: projectSelect });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id }, select: projectSelect });
    if (!project) {
      throw new NotFoundException('Проект не найден');
    }
    return project;
  }

  async create(ownerId: string, dto: CreateProjectDto) {
    assertHasAnyCommand(dto.installCmd, dto.testCmd, dto.buildCmd);
    assertDeployPortsConsistent(dto.containerPort, dto.hostPort);
    assertValidCron(dto.triggerMode, dto.cronExpr);
    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        gitUrl: dto.gitUrl,
        branch: dto.branch,
        ownerId,
        installCmd: dto.installCmd,
        testCmd: dto.testCmd,
        buildCmd: dto.buildCmd,
        triggerMode: dto.triggerMode,
        cronExpr: dto.cronExpr,
        containerPort: dto.containerPort,
        hostPort: dto.hostPort,
        isPublic: dto.isPublic,
        ...encryptProjectEnv(mergeEnv({}, dto.env ?? [])),
        deployKey: {
          create: { encryptedPrivateKey: encryptSecret(dto.deployPrivateKey) },
        },
      },
      select: projectSelect,
    });
    this.cronTrigger.reschedule(project.id, project.triggerMode, project.cronExpr);
    return project;
  }

  async update(id: string, dto: UpdateProjectDto, actorRole: UserRole) {
    const existing = await this.findOne(id);
    // Compose-файл берётся из репозитория и ветки проекта: подменить их — то же самое,
    // что включить compose-деплой с чужим файлом, а это право только admin.
    const changesSource =
      (dto.gitUrl !== undefined && dto.gitUrl !== existing.gitUrl) ||
      (dto.branch !== undefined && dto.branch !== existing.branch);
    if (existing.deployMode === 'compose' && changesSource && actorRole !== 'admin') {
      throw new ForbiddenException('Репозиторий и ветку compose-проекта меняет только администратор');
    }
    assertHasAnyCommand(
      dto.installCmd ?? existing.installCmd,
      dto.testCmd ?? existing.testCmd,
      dto.buildCmd ?? existing.buildCmd,
    );
    assertDeployPortsConsistent(
      dto.containerPort ?? existing.containerPort,
      dto.hostPort ?? existing.hostPort,
    );
    assertValidCron(dto.triggerMode ?? existing.triggerMode, dto.cronExpr ?? existing.cronExpr);
    const project = await this.prisma.project.update({ where: { id }, data: dto, select: projectSelect });
    this.cronTrigger.reschedule(project.id, project.triggerMode, project.cronExpr);
    return project;
  }

  async remove(id: string) {
    const project = await this.findOne(id);
    await this.prisma.project.delete({ where: { id } });
    this.cronTrigger.unschedule(id);
    await this.teardownDeploy(id, project.deployMode);
  }

  // Смена режима останавливает то, что было задеплоено в старом: иначе одиночный
  // контейнер продолжил бы держать порт рядом с compose-сервисами, и наоборот.
  // Новый режим начнёт работать со следующей сборки основной ветки.
  async setDeployMode(id: string, mode: DeployMode, composeFile: string) {
    const existing = await this.findOne(id);
    const project = await this.prisma.project.update({
      where: { id },
      data: { deployMode: mode, composeFile },
      select: projectSelect,
    });
    if (existing.deployMode !== mode) {
      await this.teardownDeploy(id, existing.deployMode);
    }
    return project;
  }

  private teardownDeploy(id: string, mode: DeployMode) {
    return mode === 'compose' ? this.composeDeploy.teardown(id) : this.deployRunner.teardown(id);
  }

  // Ключ можно только заменить целиком, не отредактировать частично — обычный
  // список/карточка проекта его никогда не возвращает (см. projectSelect);
  // единственный путь увидеть расшифрованное значение — revealDeployKey ниже,
  // и то только для роли admin (раздел 4/7 CLAUDE.md).
  async replaceDeployKey(id: string, privateKey: string) {
    await this.findOne(id);
    await this.prisma.deployKey.upsert({
      where: { projectId: id },
      update: { encryptedPrivateKey: encryptSecret(privateKey) },
      create: { projectId: id, encryptedPrivateKey: encryptSecret(privateKey) },
    });
  }

  async setEnv(id: string, variables: EnvVariableDto[]) {
    const project = await this.prisma.project.findUnique({ where: { id }, select: { encryptedEnv: true } });
    if (!project) {
      throw new NotFoundException('Проект не найден');
    }
    const env = mergeEnv(decryptProjectEnv(project.encryptedEnv), variables);
    return this.prisma.project.update({ where: { id }, data: encryptProjectEnv(env), select: projectSelect });
  }

  async revealEnv(id: string): Promise<ProjectEnv> {
    const project = await this.prisma.project.findUnique({ where: { id }, select: { encryptedEnv: true } });
    if (!project) {
      throw new NotFoundException('Проект не найден');
    }
    return decryptProjectEnv(project.encryptedEnv);
  }

  async revealDeployKey(id: string): Promise<string> {
    const project = await this.prisma.project.findUnique({ where: { id }, include: { deployKey: true } });
    if (!project) {
      throw new NotFoundException('Проект не найден');
    }
    if (!project.deployKey) {
      throw new BadRequestException('У проекта не настроен deploy-key');
    }
    return decryptSecret(project.deployKey.encryptedPrivateKey);
  }

  async listCommits(id: string) {
    const { project, privateKey } = await this.loadWithPrivateKey(id);
    return listRecentCommits({ gitUrl: project.gitUrl, branch: project.branch, privateKey });
  }

  async listBranches(id: string) {
    const { project, privateKey } = await this.loadWithPrivateKey(id);
    return listRemoteBranches({ gitUrl: project.gitUrl, privateKey });
  }

  // Для git-операций на стороне backend; расшифрованный ключ не покидает сервис.
  private async loadWithPrivateKey(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id }, include: { deployKey: true } });
    if (!project) {
      throw new NotFoundException('Проект не найден');
    }
    if (!project.deployKey) {
      throw new BadRequestException('У проекта не настроен deploy-key');
    }
    return { project, privateKey: decryptSecret(project.deployKey.encryptedPrivateKey) };
  }
}
