import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js'
import { AuthController } from './auth.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PassportModule } from '@nestjs/passport';
import { jwtConstants } from './constatnt.js';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports:[PassportModule.register({session:false}),
    JwtModule.register({}),],
  providers: [AuthService,LocalStrategy, JwtStrategy,RefreshTokenStrategy,LocalAuthGuard,JwtAuthGuard,RefreshTokenGuard],
  controllers: [AuthController],
  exports:[AuthService,JwtModule, PassportModule]
})
export class AuthModule {}
