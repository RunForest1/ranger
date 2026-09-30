import { IsString, MinLength } from 'class-validator';

export class ReplaceDeployKeyDto {
  @IsString()
  @MinLength(1)
  deployPrivateKey!: string;
}
