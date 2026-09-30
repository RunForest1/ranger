import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DeploymentsService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForProject(projectId: string) {
    return this.prisma.deployment.findMany({
      where: { projectId },
      orderBy: { deployedAt: 'desc' },
    });
  }
}
