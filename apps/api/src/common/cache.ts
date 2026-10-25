import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response } from 'express';
import { Observable, tap } from 'rxjs';

const CACHE_SECONDS = 'bb:cache-seconds';

export const PublicCache = (seconds: number) => SetMetadata(CACHE_SECONDS, seconds);

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const seconds = this.reflector.get<number | undefined>(CACHE_SECONDS, context.getHandler());

    return next.handle().pipe(
      tap(() => {
        if (seconds) {
          context.switchToHttp().getResponse<Response>().setHeader('Cache-Control', `public, max-age=${seconds}`);
        }
      }),
    );
  }
}
