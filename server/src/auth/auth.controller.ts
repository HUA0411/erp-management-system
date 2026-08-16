import { Body, Controller, Get, Post, Put } from '@nestjs/common';
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

  @Public()
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
    return this.authService.changePassword(
      user.userId!,
      user.companyId,
      dto.oldPassword,
      dto.newPassword,
    );
  }
}
