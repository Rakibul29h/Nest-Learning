import {
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

import type { Request } from 'express';
import { JwtPayload } from '../interface/jwt-payload.interface.js';


interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

export const CurrentUser = createParamDecorator(
  (
    data: keyof JwtPayload | undefined,
    ctx: ExecutionContext,
  ) => {
    const request = ctx
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();

    const user = request.user;

    return data ? user?.[data] : user;
  },
);