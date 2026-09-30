import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { DockerModule } from './docker/docker.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { BuildsModule } from './builds/builds.module';
import { DeploymentsModule } from './deployments/deployments.module';
import { ContainersModule } from './containers/containers.module';
import { FilesModule } from './files/files.module';
import { MetricsModule } from './metrics/metrics.module';
import { AuditModule } from './audit/audit.module';
import { TerminalModule } from './terminal/terminal.module';
import { StatusModule } from './status/status.module';
import { UsersModule } from './users/users.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

@Module({
  imports: [
    PrismaModule,
    DockerModule,
    AuditModule,
    AuthModule,
    ProjectsModule,
    BuildsModule,
    DeploymentsModule,
    ContainersModule,
    FilesModule,
    MetricsModule,
    TerminalModule,
    StatusModule,
    UsersModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
