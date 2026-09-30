import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateProjectDto } from './create-project.dto';

// deploy-key и env меняются отдельными эндпоинтами: оба секретные, и частичное
// обновление у них своё (см. projects.controller.ts).
export class UpdateProjectDto extends PartialType(
  OmitType(CreateProjectDto, ['deployPrivateKey', 'env'] as const),
) {}
