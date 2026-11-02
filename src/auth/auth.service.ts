import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtPayload } from './interface/jwt-payload.interface.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordMatched = await bcrypt.compare(
      password,
      user.password || '',
    );

    if (!isPasswordMatched) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const { password: _, ...userWithoutPassword } = user;

    return userWithoutPassword;
  }

  async generateTokens(user: JwtPayload) {
    const payload: JwtPayload = {
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  // =========================================
  // 3. Login
  // =========================================

  async login(user: JwtPayload) {
    const tokens = await this.generateTokens(user);

    return {
      user,
      ...tokens,
    };
  }

  // =========================================
  // 4. Get Current User
  // =========================================

  async getMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      omit: {
        password: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async refreshTokens(user: JwtPayload) {
    // Generate a new access token and refresh token
    return this.generateTokens(user);
  }
}
