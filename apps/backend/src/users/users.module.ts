import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AdminBootstrapService } from './admin-bootstrap.service';

@Module({
  imports: [AuditModule],
  controllers: [UsersController],
  providers: [UsersService, AdminBootstrapService],
})
export class UsersModule {}
