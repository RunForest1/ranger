import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { ContainersService } from './containers.service';

@UseGuards(SessionGuard)
@Controller('containers')
export class ContainersController {
  constructor(private readonly containersService: ContainersService) {}

  @Get()
  findAll() {
    return this.containersService.findAll();
  }
}
