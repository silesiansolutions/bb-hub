import { plainToInstance, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

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
  @IsString()
  ORIGIN_SECRET?: string;
}

export const validateEnv = (raw: Record<string, unknown>): Env => {
  const env = plainToInstance(Env, raw, { enableImplicitConversion: true });
  const errors = validateSync(env, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('; '));
  }

  return env;
};
