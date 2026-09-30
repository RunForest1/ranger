import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ReauthDto } from './dto/reauth.dto';
import { SessionGuard } from './session.guard';
import { AllowPendingPasswordChange, RequireRole } from './roles.decorator';

// Регистрации нет (итерация 5): первый admin создаётся при старте на пустой базе
// (users/admin-bootstrap.service.ts), остальных заводит admin в админке пользователей.
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    req.session.userId = user.id;
    return { id: user.id, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request) {
    await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
    return { ok: true };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  @AllowPendingPasswordChange()
  me(@Req() req: Request) {
    return this.authService.me(req.session.userId!);
  }

  @Post('change-password')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @AllowPendingPasswordChange()
  async changePassword(@Req() req: Request, @Body() dto: ChangePasswordDto) {
    await this.authService.changePassword(req.session.userId!, dto.currentPassword, dto.newPassword);
    return { ok: true };
  }

  // Раздел 4/7 CLAUDE.md: терминал требует отдельной повторной аутентификации —
  // просто ещё не истёкшей сессии недостаточно. terminal.gateway.ts проверяет
  // свежесть terminalReauthAt перед тем, как открыть сессию шелла.
  @Post('reauth')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @RequireRole('admin')
  async reauth(@Req() req: Request, @Body() dto: ReauthDto) {
    await this.authService.verifyPassword(req.session.userId!, dto.password);
    req.session.terminalReauthAt = Date.now();
    return { ok: true };
  }
}
