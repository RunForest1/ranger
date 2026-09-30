import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { FilesService } from './files.service';

@UseGuards(SessionGuard)
@Controller('projects/:projectId/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  list(@Param('projectId') projectId: string, @Query('path') path?: string) {
    return this.filesService.list(projectId, path ?? '');
  }

  @Get('content')
  readFile(@Param('projectId') projectId: string, @Query('path') path: string) {
    return this.filesService.readFile(projectId, path);
  }
}
