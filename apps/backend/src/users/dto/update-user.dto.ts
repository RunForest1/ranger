import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsIn(['admin', 'operator', 'viewer'])
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  disabled?: boolean;
}
