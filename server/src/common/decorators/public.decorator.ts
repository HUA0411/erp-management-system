import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** 标记接口无需登录（如登录接口本身） */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
