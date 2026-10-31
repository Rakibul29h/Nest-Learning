import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration.js';

@Module({
  imports: [PrismaModule,ConfigModule.forRoot({
    isGlobal: true,
    load:[configuration]
  })],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
