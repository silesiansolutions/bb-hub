import { timingSafeEqual } from 'node:crypto';

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

export const ORIGIN_HEADER = 'x-origin-secret';
export const CLIENT_IP_HEADER = 'x-client-ip';

export const sameSecret = (given: string, expected: string): boolean => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
};

type Headers = Record<string, string | string[] | undefined>;

const single = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? undefined : value || undefined);

export const clientKey = (headers: Headers, socketAddress: string | undefined, secret: string | undefined): string => {
  const given = single(headers[ORIGIN_HEADER]);
  const forwarded = single(headers[CLIENT_IP_HEADER]);

  if (secret && given && forwarded && sameSecret(given, secret)) {
    return forwarded;
  }

  return single(headers['cf-connecting-ip']) ?? socketAddress ?? 'unknown';
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
