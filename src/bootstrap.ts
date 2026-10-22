import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

export function validateEnvironment() {
  const missing = ['DATABASE_URL', 'JWT_SECRET'].filter(
    (key) => !process.env[key],
  );
  if (missing.length)
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
}

export async function createApplication(): Promise<NestExpressApplication> {
  validateEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin:
      process.env.CORS_ORIGIN?.split(',').map((value) => value.trim()) ?? true,
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}
