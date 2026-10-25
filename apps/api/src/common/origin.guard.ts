import { timingSafeEqual } from 'node:crypto';

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

export const ORIGIN_HEADER = 'x-origin-secret';

const sameSecret = (given: string, expected: string): boolean => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
};

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('ORIGIN_SECRET');

    if (!expected) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    if (request.path === '/api/health') {
      return true;
    }

    const given = request.header(ORIGIN_HEADER);

    if (!given || !sameSecret(given, expected)) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
