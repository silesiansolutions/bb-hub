import { plainToInstance, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

export class Env {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3001;

  @IsString()
  MONGODB_URI!: string;

  @IsString()
  REDIS_URL!: string;

  @IsOptional()
  @IsIn(['production', 'development', 'test'])
  NODE_ENV?: string;

  @IsOptional()
  @IsString()
  ORIGIN_SECRET?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  ORIGIN_SECRET_DISABLED?: string;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;
}

export const validateEnv = (raw: Record<string, unknown>): Env => {
  const present = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ''));
  const env = plainToInstance(Env, present, { enableImplicitConversion: true });
  const errors = validateSync(env, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('; '));
  }

  if (env.NODE_ENV === 'production' && !env.ORIGIN_SECRET && env.ORIGIN_SECRET_DISABLED !== 'true') {
    throw new Error('ORIGIN_SECRET is required in production; set ORIGIN_SECRET_DISABLED=true to run without it');
  }

  if (env.NODE_ENV === 'production' && env.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN is for local development only');
  }

  return env;
};
