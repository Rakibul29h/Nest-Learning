import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';

import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import { LocalAuthGuard } from './guards/local-auth.guard.js';
import  type { JwtPayload } from './interface/jwt-payload.interface.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { RefreshTokenGuard } from './guards/refresh-token.guard.js';



@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  // Cookie options

  private getCookieOptions() {
    const isProduction =
      process.env.NODE_ENV === 'production';

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' as const : 'lax' as const,
      path: '/',
    };
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    const options = this.getCookieOptions();

    res.cookie('accessToken', accessToken, {
      ...options,
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refreshToken', refreshToken, {
      ...options,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  // --------------------------------
  // LOGIN
  // --------------------------------

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(
    @Req() req: { user: JwtPayload },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(
      req.user,
    );

    this.setAuthCookies(
      res,
      result.accessToken,
      result.refreshToken,
    );

    return {
      success: true,
      message: 'User logged in successfully',
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      },
    };
  }

  // --------------------------------
  // GET ME
  // --------------------------------

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.authService.getMe(
      user.userId,
    );

    return {
      success: true,
      message: 'User profile fetched successfully',
      data: result,
    };
  }

  // --------------------------------
  // REFRESH TOKEN
  // --------------------------------

  @UseGuards(RefreshTokenGuard)
  @Post('refresh-token')
  async refreshToken(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.refreshTokens(
      user,
    );

    this.setAuthCookies(
      res,
      result.accessToken,
      result.refreshToken,
    );

    return {
      success: true,
      message: 'Tokens refreshed successfully',
      data: result,
    };
  }

  // --------------------------------
  // LOGOUT
  // --------------------------------

  @Post('logout')
  logout(
    @Res({ passthrough: true }) res: Response,
  ) {
    const options = this.getCookieOptions();

    res.clearCookie('accessToken', options);
    res.clearCookie('refreshToken', options);

    return {
      success: true,
      message: 'Logged out successfully',
      data: null,
    };
  }
}