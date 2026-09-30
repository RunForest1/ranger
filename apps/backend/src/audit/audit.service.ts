import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Раздел 4/7 CLAUDE.md: "кто зашёл в терминал, кто нажал деплой, кто запросил
// секрет — видно в UI, не только в БД". Единая точка записи — чтобы формат
// action/target не расходился между вызывающими местами.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(userId: string, action: string, target: string) {
    return this.prisma.auditLog.create({ data: { userId, action, target } });
  }

  findRecent(limit = 200) {
    return this.prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true } } },
    });
  }
}
