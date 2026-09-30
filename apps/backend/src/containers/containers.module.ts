import { Module } from '@nestjs/common';
import { ContainersController } from './containers.controller';
import { ContainersService } from './containers.service';
import { ContainersGateway } from './containers.gateway';

@Module({
  controllers: [ContainersController],
  providers: [ContainersService, ContainersGateway],
})
export class ContainersModule {}
