import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { SessionGuard } from '../auth/session.guard';
import { RequireRole } from '../auth/roles.decorator';
import { BuildsService } from './builds.service';
import { TriggerBuildDto } from './dto/trigger-build.dto';

@UseGuards(SessionGuard)
@Controller()
export class BuildsController {
  constructor(private readonly buildsService: BuildsService) {}

  @Post('projects/:projectId/builds')
  @RequireRole('operator')
  trigger(@Param('projectId') projectId: string, @Body() dto: TriggerBuildDto, @Req() req: Request) {
    return this.buildsService.trigger(projectId, req.session.userId!, dto.branch);
  }

  @Get('projects/:projectId/builds')
  findAllForProject(@Param('projectId') projectId: string) {
    return this.buildsService.findAllForProject(projectId);
  }

  @Get('builds/:id')
  findOne(@Param('id') id: string) {
    return this.buildsService.findOne(id);
  }
}
