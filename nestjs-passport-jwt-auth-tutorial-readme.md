# NestJS Authentication with Passport, JWT, Prisma & HTTP-only Cookies

A step-by-step tutorial for building email/password authentication in
NestJS using:

-   **NestJS** for the application framework
-   **Passport** for authentication strategies
-   **Local Strategy** for email/password login
-   **JWT Strategy** for protected routes
-   **JWT Refresh Strategy** for refreshing tokens
-   **Prisma** for database access
-   **bcryptjs** for password verification
-   **HTTP-only cookies** for storing access and refresh tokens

This guide focuses on the authentication flow. It is based on a Prisma
user model with fields such as `id`, `name`, `email`, `password`,
`role`, `status`, `isDeleted`, and `emailVerified`.

> Adjust import paths, Prisma enum paths, and model fields to match your
> own project. The examples assume an Express-based NestJS application.

------------------------------------------------------------------------

## 1. Understand the authentication flow

There are three Passport strategies:

  -----------------------------------------------------------------------
  Strategy                Responsibility          Used for
  ----------------------- ----------------------- -----------------------
  Local Strategy          Checks email and        Login
                          password                

  JWT Strategy            Verifies the access     Protected routes
                          token                   

  Refresh Token Strategy  Verifies the refresh    Refresh endpoint
                          token                   
  -----------------------------------------------------------------------

### Login flow

1.  Client sends email and password to `POST /auth/login`.
2.  `LocalAuthGuard` invokes `LocalStrategy`.
3.  `LocalStrategy` calls `AuthService.validateUser()`.
4.  The service finds the user and compares the password with `bcrypt`.
5.  Passport puts the validated user on `request.user`.
6.  Controller calls `AuthService.login()`.
7.  The service creates access and refresh JWTs.
8.  Controller stores them in HTTP-only cookies.

### Protected-route flow

1.  Client sends a request to a protected endpoint.
2.  `JwtAuthGuard` invokes `JwtStrategy`.
3.  Strategy extracts the access token from the cookie (or Bearer
    header).
4.  Passport verifies the signature and expiration.
5.  Strategy loads/checks the user and returns a safe user object.
6.  Passport assigns that object to `request.user`.

### Refresh flow

1.  Client sends a request to `POST /auth/refresh-token`.
2.  `RefreshTokenGuard` invokes the refresh strategy.
3.  The strategy verifies the refresh token and checks the user.
4.  Controller calls `AuthService.refreshTokens()`.
5.  New tokens are issued and cookies are replaced.

------------------------------------------------------------------------

## 2. Create the NestJS project

If you have not created a project yet:

``` bash
npm i -g @nestjs/cli
nest new nest-auth
cd nest-auth
```

Generate the auth module, service, and controller:

``` bash
nest g module modules/auth
nest g service modules/auth
nest g controller modules/auth
```

Install the packages:

``` bash
npm install @nestjs/passport passport passport-local passport-jwt
npm install @nestjs/jwt @nestjs/config
npm install bcryptjs cookie-parser
npm install class-validator class-transformer
```

Install development type definitions:

``` bash
npm install -D @types/passport-local @types/passport-jwt
npm install -D @types/cookie-parser
```

Install and configure Prisma if it is not already in your project:

``` bash
npm install @prisma/client
npm install -D prisma
npx prisma init
```

You also need a database connection in `.env` and a generated Prisma
client. Follow your project's Prisma generator configuration. If your
project uses a custom generated client, import `PrismaClient` and enums
from that generated location rather than assuming `@prisma/client`.

------------------------------------------------------------------------

## 3. Suggested folder structure

One possible structure:

``` text
src/
├── main.ts
├── app.module.ts
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts
└── modules/
    └── auth/
        ├── auth.module.ts
        ├── auth.controller.ts
        ├── auth.service.ts
        ├── auth.types.ts
        ├── decorators/
        │   └── current-user.decorator.ts
        ├── guards/
        │   ├── local-auth.guard.ts
        │   ├── jwt-auth.guard.ts
        │   └── refresh-token.guard.ts
        └── strategies/
            ├── local.strategy.ts
            ├── jwt.strategy.ts
            └── refresh-token.strategy.ts
```

The exact structure is flexible. Keep strategies, guards, controller,
and service grouped by feature.

------------------------------------------------------------------------

## 4. Configure environment variables

Add these to `.env`:

``` env
DATABASE_URL="your_database_connection_string"

JWT_ACCESS_SECRET="replace_with_a_long_random_access_secret"
JWT_REFRESH_SECRET="replace_with_a_different_long_random_refresh_secret"

FRONTEND_URL="http://localhost:3000"
NODE_ENV="development"
```

Use different, strong, randomly generated secrets. Do not commit `.env`
to Git.

For example, generate a secret with:

``` bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Run it twice to generate separate access and refresh secrets.

------------------------------------------------------------------------

## 5. Configure ConfigModule and PrismaModule

### `src/app.module.ts`

``` typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
  ],
})
export class AppModule {}
```

### `src/prisma/prisma.service.ts`

A typical Prisma service looks like this:

``` typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

If your Prisma client is generated into a custom directory, change the
`PrismaClient` import to that generated client.

### `src/prisma/prisma.module.ts`

``` typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

------------------------------------------------------------------------

## 6. Create authentication types

### `src/modules/auth/auth.types.ts`

``` typescript
export interface JwtPayload {
  userId: string;
  name: string;
  email: string;
  role: string;
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: string;
}
```

The `AuthenticatedUser` object should not contain the password hash.

------------------------------------------------------------------------

## 7. Build the AuthService

The service contains the business logic. Passport strategies call it;
they should not duplicate database or password logic.

### `src/modules/auth/auth.service.ts`

``` typescript
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../../prisma/prisma.service';
import { UserStatus } from '../../../generated/prisma/enums';
import type { JwtPayload, AuthenticatedUser } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // Called by LocalStrategy
  async validateUser(
    email: string,
    password: string,
  ): Promise<AuthenticatedUser> {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Use the same message for unknown email and wrong password.
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === UserStatus.BLOCKED) {
      throw new ForbiddenException('User is blocked');
    }

    if (user.isDeleted || user.status === UserStatus.DELETED) {
      throw new ForbiddenException('User is deleted');
    }

    if (!user.emailVerified) {
      throw new ForbiddenException('Please verify your email first');
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password ?? '',
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }

  // Creates a new access token and refresh token.
  async generateTokens(user: AuthenticatedUser) {
    const payload: JwtPayload = {
      userId: user.id,
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

    return { accessToken, refreshToken };
  }

  // Called by the login controller after LocalStrategy succeeds.
  async login(user: AuthenticatedUser) {
    const tokens = await this.generateTokens(user);

    return {
      user,
      ...tokens,
    };
  }

  // Gets the current user's latest database data.
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { patient: true },
      omit: { password: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.isDeleted || user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('User is inactive');
    }

    return user;
  }

  // Called after RefreshTokenStrategy has validated the refresh token.
  async refreshTokens(user: AuthenticatedUser) {
    return this.generateTokens(user);
  }
}
```

> This service uses the `patient` relation and
> `omit: { password: true }` in `getMe()` to match the example user
> model. Change these fields if your Prisma schema is different.

------------------------------------------------------------------------

## 8. Create the Local Strategy

The Local Strategy authenticates a user using email and password.

### `src/modules/auth/strategies/local.strategy.ts`

``` typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  constructor(private readonly authService: AuthService) {
    super({
      usernameField: 'email',
      passwordField: 'password',
    });
  }

  async validate(email: string, password: string) {
    return this.authService.validateUser(email, password);
  }
}
```

Passport Local Strategy expects `username` by default.
`usernameField: 'email'` tells it to read the `email` property instead.

### Local guard

`src/modules/auth/guards/local-auth.guard.ts`

``` typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}
```

When this guard runs, Passport calls `LocalStrategy`. If validation
succeeds, the returned user is assigned to `request.user`.

**Validation note:** Passport's Local Strategy reads `req.body` before
NestJS controller parameter pipes run. Validate login input in the
strategy/service or with middleware/guard-level validation; do not
assume a controller `@Body()` DTO pipe has already run.

------------------------------------------------------------------------

## 9. Create the JWT access-token strategy

This strategy protects routes that require a valid access token.

### `src/modules/auth/strategies/jwt.strategy.ts`

``` typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

import { AuthService } from '../auth.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserStatus } from '../../../../generated/prisma/enums';
import type { JwtPayload } from '../auth.types';

const cookieExtractor = (request: any): string | null => {
  return request?.cookies?.accessToken ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (
      !user ||
      user.isDeleted ||
      user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException('User is inactive or not found');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }
}
```

### JWT guard

`src/modules/auth/guards/jwt-auth.guard.ts`

``` typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

The access token is extracted from the `accessToken` cookie first. If it
is not present, the strategy tries the `Authorization: Bearer <token>`
header.

------------------------------------------------------------------------

## 10. Create the Refresh Token Strategy

Use a separate strategy because refresh tokens must be verified with a
different secret from access tokens.

### `src/modules/auth/strategies/refresh-token.strategy.ts`

``` typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../prisma/prisma.service';
import { UserStatus } from '../../../../generated/prisma/enums';
import type { JwtPayload } from '../auth.types';

const refreshCookieExtractor = (request: any): string | null => {
  return request?.cookies?.refreshToken ?? null;
};

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        refreshCookieExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (
      !user ||
      user.isDeleted ||
      user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }
}
```

### Refresh guard

`src/modules/auth/guards/refresh-token.guard.ts`

``` typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class RefreshTokenGuard extends AuthGuard('jwt-refresh') {}
```

The refresh strategy only reads the `refreshToken` cookie. It does not
accept the access token as a substitute.

------------------------------------------------------------------------

## 11. Create a CurrentUser decorator

This decorator gives controllers a convenient way to access
`request.user`.

### `src/modules/auth/decorators/current-user.decorator.ts`

``` typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();
    return request.user;
  },
);
```

After a Passport guard succeeds, the authenticated user is available
through `@CurrentUser()`.

------------------------------------------------------------------------

## 12. Configure the AuthModule

### `src/modules/auth/auth.module.ts`

``` typescript
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy';

import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';

@Module({
  imports: [
    PassportModule.register({ session: false }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalStrategy,
    JwtStrategy,
    RefreshTokenStrategy,
    LocalAuthGuard,
    JwtAuthGuard,
    RefreshTokenGuard,
  ],
  exports: [AuthService],
})
export class AuthModule {}
```

`JwtModule.register({})` is sufficient here because each
strategy/service supplies its own secret when signing or verifying
tokens.

------------------------------------------------------------------------

## 13. Create the AuthController

The controller handles HTTP requests and sets or clears cookies.

### `src/modules/auth/auth.controller.ts`

``` typescript
import {
  Controller,
  Post,
  Get,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private cookieOptions() {
    const isProduction = process.env.NODE_ENV === 'production';

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      path: '/',
    };
  }

  private setAuthCookies(
    response: Response,
    tokens: { accessToken: string; refreshToken: string },
  ) {
    const options = this.cookieOptions();

    response.cookie('accessToken', tokens.accessToken, {
      ...options,
      maxAge: 15 * 60 * 1000,
    });

    response.cookie('refreshToken', tokens.refreshToken, {
      ...options,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  @Post('login')
  @UseGuards(LocalAuthGuard)
  async login(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(user);

    this.setAuthCookies(response, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });

    return {
      message: 'Login successful',
      user: result.user,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.id);
  }

  @Post('refresh-token')
  @UseGuards(RefreshTokenGuard)
  async refreshToken(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const tokens = await this.authService.refreshTokens(user);

    this.setAuthCookies(response, tokens);

    return {
      message: 'Token refreshed successfully',
    };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    const options = this.cookieOptions();

    response.clearCookie('accessToken', options);
    response.clearCookie('refreshToken', options);

    return {
      message: 'Logged out successfully',
    };
  }
}
```

The cookie `sameSite` setting must match your deployment:

-   Use `lax` when the frontend and API are same-site in a typical
    deployment.
-   Use `none` with `secure: true` when cookies must be sent cross-site
    over HTTPS.
-   Cross-site cookie authentication needs appropriate CSRF protection.

The `logout()` shown here clears browser cookies only. It does not
revoke a copied JWT. Add server-side refresh-session storage and
revocation for production.

------------------------------------------------------------------------

## 14. Configure main.ts

Cookie parsing must be enabled before requests reach Passport
strategies.

### `src/main.ts`

``` typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  app.enableCors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  });

  await app.listen(5000);
}

bootstrap();
```

If you use a global validation pipe, you can add it here too:

``` typescript
import { ValidationPipe } from '@nestjs/common';

// Inside bootstrap:
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
);
```

Remember: controller DTO pipes do not run before the Local Strategy
reads the raw request body. Validate credentials before or during
`LocalStrategy` validation.

------------------------------------------------------------------------

## 15. Test the endpoints

Start the NestJS server:

``` bash
npm run start:dev
```

Assuming the server runs on port `5000`, test these routes.

### A. Login

`POST http://localhost:5000/auth/login`

JSON body:

``` json
{
  "email": "user@example.com",
  "password": "your_password"
}
```

Expected behavior:

-   Passport Local Strategy validates the credentials.
-   Server returns a success message and safe user data.
-   Server sets `accessToken` and `refreshToken` HTTP-only cookies.

### B. Get current user

`GET http://localhost:5000/auth/me`

Send the cookies received during login. The JWT guard validates the
access token.

### C. Refresh tokens

`POST http://localhost:5000/auth/refresh-token`

Send the refresh cookie. The refresh strategy validates it and the
server sets new token cookies.

### D. Logout

`POST http://localhost:5000/auth/logout`

The example clears both browser cookies.

For browser requests, include credentials:

``` typescript
const response = await fetch('http://localhost:5000/auth/me', {
  method: 'GET',
  credentials: 'include',
});
```

For login:

``` typescript
const response = await fetch('http://localhost:5000/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'your_password',
  }),
});

const data = await response.json();
```

JavaScript cannot read an HTTP-only cookie. The browser stores and sends
it automatically when credentials and cookie policies allow it.

------------------------------------------------------------------------

## 16. How to remember the architecture

Think of the responsibilities this way:

  -----------------------------------------------------------------------
  File                                Responsibility
  ----------------------------------- -----------------------------------
  `auth.controller.ts`                HTTP routes and cookies

  `auth.service.ts`                   Business logic, Prisma queries,
                                      password checks, token generation

  `local.strategy.ts`                 Email/password Passport
                                      authentication

  `jwt.strategy.ts`                   Access-token verification

  `refresh-token.strategy.ts`         Refresh-token verification

  `local-auth.guard.ts`               Activates Local Strategy

  `jwt-auth.guard.ts`                 Protects routes with access JWT

  `refresh-token.guard.ts`            Protects refresh endpoint

  `current-user.decorator.ts`         Reads authenticated user from
                                      request

  `auth.module.ts`                    Registers and connects auth
                                      providers
  -----------------------------------------------------------------------

The important Passport pattern is:

``` text
HTTP Request
    |
    v
Guard
    |
    v
Passport Strategy
    |
    v
AuthService / Database
    |
    v
Strategy returns user
    |
    v
request.user
    |
    v
Controller
```

------------------------------------------------------------------------

## 17. Important production improvements

The code above is a learning implementation. Before using it in a
production application, improve the following areas.

### 17.1 Store refresh sessions in the database

Create a refresh-session model containing at least:

-   Session ID
-   User ID
-   Hashed refresh token (or a securely stored token identifier)
-   Expiration time
-   Revocation time
-   Created time

Include a unique token identifier (`jti`) in refresh JWTs. When
refreshing, verify that the session exists, is not revoked, and has not
expired.

### 17.2 Rotate refresh tokens

When a refresh token is used:

1.  Validate its signature and session.
2.  Revoke or consume the old session/token.
3.  Create a new refresh token and session.
4.  Store the new token hash/session data.
5.  Set the new cookies.

Use a database transaction or another atomic mechanism to prevent
concurrent reuse.

### 17.3 Implement real logout

Logout should revoke the current refresh session in the database and
clear the cookies. Clearing cookies alone does not invalidate a stolen
token.

### 17.4 Add CSRF protection

HTTP-only cookies help prevent JavaScript from reading tokens, but
cookies are automatically sent by browsers. Protect state-changing
endpoints against CSRF, especially when using cross-site cookies.

### 17.5 Add rate limiting

Limit repeated login, OTP, password-reset, and refresh attempts. Avoid
revealing whether an email address exists.

### 17.6 Keep secrets outside source code

Use environment variables or a secrets manager. Never commit real
secrets to Git.

------------------------------------------------------------------------

## 18. Troubleshooting

### `Unknown authentication strategy "local"`

Check that:

-   `LocalStrategy` is listed in `AuthModule.providers`.
-   `PassportModule` is imported.
-   The guard name is exactly `local`.

### `Unknown authentication strategy "jwt"`

Check that:

-   `JwtStrategy` is registered in the module providers.
-   `JwtAuthGuard` uses `AuthGuard('jwt')`.
-   The strategy name matches the guard name.

### `req.cookies` is undefined

Check that:

-   `cookie-parser` is installed.
-   `app.use(cookieParser())` is called in `main.ts`.
-   It is registered before the application handles requests.

### Cookies are not saved in the browser

Check:

-   `credentials: 'include'` on frontend requests.
-   `credentials: true` in NestJS CORS configuration.
-   CORS origin is the exact frontend origin, not `*`.
-   `secure` and `sameSite` settings match your HTTP/HTTPS and domain
    setup.

### Refresh token is rejected

Check:

-   The refresh cookie is named `refreshToken`.
-   The refresh strategy uses `JWT_REFRESH_SECRET`.
-   The token has not expired.
-   The account is still active.
-   The frontend sends credentials.

### Prisma enum import fails

Your project may use a custom Prisma output directory. Import
`UserStatus` from the generated enums location configured in your Prisma
schema. Do not copy the example path blindly.

------------------------------------------------------------------------

## 19. Recommended learning order

If you are rebuilding this without looking at the code, follow this
order:

1.  Create a NestJS module, controller, and service.
2.  Connect Prisma and inject `PrismaService`.
3.  Understand Passport and how `AuthGuard()` works.
4.  Implement `AuthService.validateUser()`.
5.  Implement `LocalStrategy` and `LocalAuthGuard`.
6.  Implement JWT signing in `AuthService`.
7.  Implement `JwtStrategy` and `JwtAuthGuard`.
8.  Add the `CurrentUser` decorator.
9.  Implement the refresh strategy and guard.
10. Set and clear HTTP-only cookies in the controller.
11. Configure `cookie-parser` and CORS.
12. Test login, protected routes, refresh, and logout.
13. Add persistent refresh sessions, rotation, revocation, and CSRF
    protection.

**Practice challenge:** After completing the tutorial, try rebuilding
the entire authentication flow from an empty module using only the
folder structure and the responsibility table in section 16. This is a
good way to check whether you understand how NestJS guards, Passport
strategies, services, and controllers work together.
