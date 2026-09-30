import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { EnvVariableDto } from './set-project-env.dto';

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  gitUrl!: string;

  @IsString()
  branch: string = 'main';

  @IsString()
  deployPrivateKey!: string;

  @IsOptional()
  @IsString()
  installCmd?: string;

  @IsOptional()
  @IsString()
  testCmd?: string;

  @IsOptional()
  @IsString()
  buildCmd?: string;

  @IsIn(['cron', 'manual'])
  triggerMode: 'cron' | 'manual' = 'manual';

  @ValidateIf((dto) => dto.triggerMode === 'cron')
  @IsString()
  cronExpr?: string;

  // Оба порта нужны вместе — раз один задан, второй обязателен (см. projects.service.ts).
  @ValidateIf((dto) => dto.containerPort != null || dto.hostPort != null)
  @IsInt()
  @Min(1)
  @Max(65535)
  containerPort?: number;

  @ValidateIf((dto) => dto.containerPort != null || dto.hostPort != null)
  @IsInt()
  @Min(1)
  @Max(65535)
  hostPort?: number;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => EnvVariableDto)
  env?: EnvVariableDto[];
}
