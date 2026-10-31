import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import {  ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  
  const port = app.get(ConfigService).get<number>('port');
  await app.listen(port!);
}
await bootstrap();
