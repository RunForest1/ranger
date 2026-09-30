import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { SessionGuard } from '../auth/session.guard';
import { RequireRole } from '../auth/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CheckRepositoryDto } from './dto/check-repository.dto';
import { ReplaceDeployKeyDto } from './dto/replace-deploy-key.dto';
import { SetProjectEnvDto } from './dto/set-project-env.dto';
import { SetDeployModeDto } from './dto/set-deploy-mode.dto';
import { listRemoteBranches } from './list-branches';

// Чтение — любой роли (viewer включительно), изменения — operator и выше,
// расшифровка deploy-key — только admin (итерация 5).
@UseGuards(SessionGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Get(':id/commits')
  async listCommits(@Param('id') id: string) {
    try {
      return await this.projectsService.listCommits(id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException((error as Error).message);
    }
  }

  @Get(':id/branches')
  async listBranches(@Param('id') id: string) {
    try {
      return await this.projectsService.listBranches(id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post()
  @RequireRole('operator')
  create(@Req() req: Request, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(req.session.userId!, dto);
  }

  @Post('check-repository')
  @HttpCode(200)
  @RequireRole('operator')
  async checkRepository(@Body() dto: CheckRepositoryDto) {
    try {
      const branches = await listRemoteBranches({ gitUrl: dto.gitUrl, privateKey: dto.deployPrivateKey });
      return { branches };
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Patch(':id')
  @RequireRole('operator')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto, @Req() req: Request) {
    return this.projectsService.update(id, dto, req.userRole!);
  }

  // Compose-файл из репозитория может запросить privileged, Docker-сокет или корень
  // хоста — включить такой деплой значит выдать репозиторию root на сервере. Поэтому
  // только admin и запись в аудит, а не обычное поле формы проекта.
  @Put(':id/deploy-mode')
  @RequireRole('admin')
  async setDeployMode(@Param('id') id: string, @Body() dto: SetDeployModeDto, @Req() req: Request) {
    const project = await this.projectsService.setDeployMode(id, dto.mode, dto.composeFile);
    await this.audit.record(req.session.userId!, 'change_deploy_mode', `${id}:${dto.mode}:${dto.composeFile}`);
    return project;
  }

  @Delete(':id')
  @HttpCode(204)
  @RequireRole('operator')
  remove(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }

  @Post(':id/deploy-key')
  @HttpCode(200)
  @RequireRole('operator')
  async replaceDeployKey(@Param('id') id: string, @Body() dto: ReplaceDeployKeyDto) {
    await this.projectsService.replaceDeployKey(id, dto.deployPrivateKey);
    return { ok: true };
  }

  @Put(':id/env')
  @RequireRole('operator')
  setEnv(@Param('id') id: string, @Body() dto: SetProjectEnvDto) {
    return this.projectsService.setEnv(id, dto.variables);
  }

  // Значения переменных — секреты наравне с deploy-key: только admin и запись в аудит.
  @Post(':id/env/reveal')
  @HttpCode(200)
  @RequireRole('admin')
  async revealEnv(@Param('id') id: string, @Req() req: Request) {
    const env = await this.projectsService.revealEnv(id);
    await this.audit.record(req.session.userId!, 'reveal_project_env', id);
    return { env };
  }

  // Единственное место, где приватный ключ целиком покидает бэкенд — поэтому только
  // admin и отдельная запись в аудит-лог (раздел 4/7 CLAUDE.md: "кто и когда
  // запрашивал расшифровку").
  @Post(':id/deploy-key/reveal')
  @HttpCode(200)
  @RequireRole('admin')
  async revealDeployKey(@Param('id') id: string, @Req() req: Request) {
    const privateKey = await this.projectsService.revealDeployKey(id);
    await this.audit.record(req.session.userId!, 'reveal_deploy_key', id);
    return { privateKey };
  }
}
