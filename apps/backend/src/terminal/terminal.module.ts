import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TerminalGateway } from './terminal.gateway';

@Module({
  imports: [AuditModule],
  providers: [TerminalGateway],
})
export class TerminalModule {}
