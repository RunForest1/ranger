import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { SessionGuard } from '../auth/session.guard';
import { RequireRole } from '../auth/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@UseGuards(SessionGuard)
@RequireRole('admin')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  async create(@Body() dto: CreateUserDto, @Req() req: Request) {
    const result = await this.usersService.create(dto.email, dto.role);
    await this.audit.record(req.session.userId!, 'create_user', `${result.user.email}:${result.user.role}`);
    return result;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: Request) {
    const user = await this.usersService.update(req.session.userId!, id, dto);
    await this.audit.record(req.session.userId!, 'update_user', `${user.email}:${user.role}${user.disabled ? ':disabled' : ''}`);
    return user;
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  async resetPassword(@Param('id') id: string, @Req() req: Request) {
    const result = await this.usersService.resetPassword(req.session.userId!, id);
    await this.audit.record(req.session.userId!, 'reset_password', result.user.email);
    return result;
  }
}
