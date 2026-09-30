import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { RequireRole } from '../auth/roles.decorator';
import { AuditService } from './audit.service';

@UseGuards(SessionGuard)
@RequireRole('admin')
@Controller('audit-log')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async findRecent() {
    const entries = await this.auditService.findRecent();
    return entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      target: entry.target,
      createdAt: entry.createdAt,
      userEmail: entry.user.email,
    }));
  }
}
