import { IsString } from 'class-validator';

export class CheckRepositoryDto {
  @IsString()
  gitUrl!: string;

  @IsString()
  deployPrivateKey!: string;
}
