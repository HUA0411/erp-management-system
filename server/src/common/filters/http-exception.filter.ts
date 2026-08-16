import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

interface ErrorBody {
  code: number;
  message: string;
}

/** 统一错误响应：业务异常透传 code；其他异常映射 HTTP 状态码 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = { code: 50000, message: '服务器内部错误' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        body = { code: status * 1000, message: res };
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        body = {
          code: typeof r.code === 'number' ? r.code : status * 1000,
          message:
            typeof r.message === 'string'
              ? r.message
              : Array.isArray(r.message)
                ? (r.message as string[]).join('；')
                : String(r.message ?? '请求失败'),
        };
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${(request as { url?: string }).url} -> ${body.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(body);
  }
}
