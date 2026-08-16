import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface ApiResponseBody<T> {
  code: number;
  message: string;
  data: T;
}

/** 统一成功响应：{ code: 0, message: 'ok', data } */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponseBody<T>> {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<ApiResponseBody<T>> {
    return next.handle().pipe(
      map((data) => ({
        code: 0,
        message: 'ok',
        data: data ?? null,
      })),
    );
  }
}
