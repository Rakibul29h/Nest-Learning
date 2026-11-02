import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';
import { JwtPayload } from '../interface/jwt-payload.interface.js';


const refreshCookieExtractor = (
  req: Request,
): string | null => {
  return req?.cookies?.refreshToken ?? null;
};

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        refreshCookieExtractor,
      ]),

      ignoreExpiration: false,

      secretOrKey:
        configService.getOrThrow<string>(
          'JWT_REFRESH_SECRET',
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
        'Invalid refresh token',
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