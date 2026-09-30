import { IsString } from 'class-validator';

export class ReauthDto {
  @IsString()
  password!: string;
}
