import { IsEmail, IsIn } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsIn(['admin', 'operator', 'viewer'])
  role!: UserRole;
}
