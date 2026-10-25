import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';

export const configureApp = (app: NestExpressApplication): NestExpressApplication => {
  app.setGlobalPrefix('api');
  app.set('trust proxy', true);
  app.disable('x-powered-by');
  app.use(helmet());
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('bb-hub API').setDescription('Parking occupancy and air quality in Bielsko-Biała, hourly aggregates').setVersion('0.1.0').build(),
  );

  SwaggerModule.setup('api/docs', app, document);

  return app;
};

const bootstrap = async (): Promise<void> => {
  const app = configureApp(await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false }));
  const port = app.get(ConfigService).getOrThrow<number>('PORT');

  await app.listen(port, '::');
};

if (require.main === module) {
  void bootstrap();
}
