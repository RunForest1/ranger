import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Единственный контроллер без SessionGuard — доступен анонимно (итерация 5).
// Отдаёт строго минимум: имя проекта, статус и время последней сборки. Ни id,
// ни URL репозитория, ни ветки, ни логов — только то, что явно видно на странице,
// и только по проектам с isPublic. Расширять ответ — значит осознанно открывать
// эти данные интернету, а не случайно добавлять поле.
@Controller('public/status')
export class StatusController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async findAll() {
    const projects = await this.prisma.project.findMany({
      where: { isPublic: true },
      orderBy: { name: 'asc' },
      select: {
        name: true,
        builds: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { status: true, createdAt: true, finishedAt: true },
        },
      },
    });

    return projects.map((project) => {
      const last = project.builds[0];
      return {
        name: project.name,
        status: last?.status ?? null,
        at: last ? (last.finishedAt ?? last.createdAt) : null,
      };
    });
  }
}
