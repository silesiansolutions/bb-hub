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

  @IsOptional()
  @IsIn(['true', 'false'])
  COLLECTOR_ENABLED?: string;

  @IsOptional()
  @IsString()
  BUFFER_DIR?: string;

  @IsOptional()
  @IsString()
  R2_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  R2_BUCKET?: string;

  @IsOptional()
  @IsString()
  R2_ACCESS_KEY_ID?: string;

  @IsOptional()
  @IsString()
  R2_SECRET_ACCESS_KEY?: string;

  @IsOptional()
  @IsString()
  BB_DATA_REPO?: string;

  @IsOptional()
  @IsString()
  BB_DATA_DIR?: string;

  @IsOptional()
  @IsString()
  BB_DATA_SSH_KEY?: string;

  @IsOptional()
  @IsString()
  BB_DATA_GIT_NAME?: string;

  @IsOptional()
  @IsString()
  BB_DATA_GIT_EMAIL?: string;
}

export const R2_KEYS = ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'] as const;
export const BB_DATA_KEYS = ['BB_DATA_REPO', 'BB_DATA_DIR', 'BB_DATA_GIT_NAME', 'BB_DATA_GIT_EMAIL'] as const;

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

  if (env.COLLECTOR_ENABLED === 'true') {
    const required = ['BUFFER_DIR', ...(env.NODE_ENV === 'production' ? [...R2_KEYS, ...BB_DATA_KEYS, 'BB_DATA_SSH_KEY'] : [])] as (keyof Env)[];
    const missing = required.filter((key) => !env[key]);

    if (missing.length > 0) {
      throw new Error(`COLLECTOR_ENABLED=true needs ${missing.join(', ')}`);
    }
  }

  return env;
};
