import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto } from './dto/auth.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { TenantContextData } from '../tenant/tenant-context';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 登录限流：每 IP 每分钟 8 次（可用 LOGIN_THROTTLE_LIMIT 覆盖，e2e 需要放宽）。
   * 全局默认 300/分钟对正常业务接口够用，对登录接口等于没限制 ——
   * 8 次/分钟足以覆盖正常人输错密码，却让在线爆破变得不可行。
   */
  @Public()
  @Throttle({ default: { limit: Number(process.env.LOGIN_THROTTLE_LIMIT ?? 8), ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.companyCode, dto.username, dto.password);
  }

  @Get('profile')
  profile(@CurrentUser() user: TenantContextData) {
    return this.authService.getProfile(user.userId!, user.companyId);
  }

  @Put('password')
  changePassword(@CurrentUser() user: TenantContextData, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.userId!, user.companyId, dto.oldPassword, dto.newPassword);
  }
}
