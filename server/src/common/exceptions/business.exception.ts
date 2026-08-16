import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 业务异常：code 为业务错误码（如 40001），message 为用户可读提示。
 */
export class BusinessException extends HttpException {
  constructor(message: string, code = 40001, status: HttpStatus = HttpStatus.OK) {
    super({ code, message }, status);
  }
}
