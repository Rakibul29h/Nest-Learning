import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { ConfigService } from '@nestjs/config';

import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';
import { JwtPayload } from '../interface/jwt-payload.interface.js';


const cookieExtractor = (req: Request): string | null => {
  return req?.cookies?.accessToken ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(
  Strategy,
  'jwt',
) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),

      ignoreExpiration: false,

      secretOrKey:
        configService.getOrThrow<string>(
          'JWT_ACCESS_SECRET',
        ),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.userId,
      },
    });

    if (
      !user 
    ) {
      throw new UnauthorizedException(
        'User is inactive or not found',
      );
    }

    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }
}