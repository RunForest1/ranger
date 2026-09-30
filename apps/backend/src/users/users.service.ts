import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { generatePassword } from './generate-password';
import { UpdateUserDto } from './dto/update-user.dto';

// passwordHash никогда не уходит в ответ API.
const userSelect = {
  id: true,
  email: true,
  role: true,
  disabled: true,
  mustChangePassword: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({ orderBy: { createdAt: 'asc' }, select: userSelect });
  }

  // Пароль генерируется и возвращается один раз — admin передаёт его человеку,
  // тот обязан сменить его при первом входе. В базе остаётся только хэш.
  async create(email: string, role: UserRole) {
    const password = generatePassword();
    try {
      const user = await this.prisma.user.create({
        data: {
          email: email.trim().toLowerCase(),
          role,
          passwordHash: await argon2.hash(password),
          mustChangePassword: true,
        },
        select: userSelect,
      });
      return { user, password };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Пользователь с таким email уже есть');
      }
      throw error;
    }
  }

  // Свою роль и статус admin менять не может: иначе единственный admin мог бы
  // одним кликом оставить систему без администратора.
  async update(actorId: string, id: string, dto: UpdateUserDto) {
    this.assertNotSelf(actorId, id);
    await this.findOne(id);
    return this.prisma.user.update({ where: { id }, data: dto, select: userSelect });
  }

  async resetPassword(actorId: string, id: string) {
    this.assertNotSelf(actorId, id);
    await this.findOne(id);
    const password = generatePassword();
    const user = await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await argon2.hash(password), mustChangePassword: true },
      select: userSelect,
    });
    return { user, password };
  }

  private async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    return user;
  }

  private assertNotSelf(actorId: string, id: string) {
    if (actorId === id) {
      throw new BadRequestException('Свою учётную запись меняйте на вкладке «Аккаунт»');
    }
  }
}
