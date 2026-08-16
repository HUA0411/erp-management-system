import { IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';
import type { LoginPayload } from '@erp/shared';

export class LoginDto implements LoginPayload {
  @IsString()
  @IsNotEmpty({ message: '公司编码不能为空' })
  @MaxLength(32)
  companyCode: string;

  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  @MaxLength(32)
  username: string;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @Length(1, 64)
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: '原密码不能为空' })
  oldPassword: string;

  @IsString()
  @IsNotEmpty({ message: '新密码不能为空' })
  @Length(6, 64, { message: '新密码长度需 6-64 位' })
  newPassword: string;
}
