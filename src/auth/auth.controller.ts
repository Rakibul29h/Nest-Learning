import { Body, Controller, Get, Post } from '@nestjs/common';
import {  registerUserSchema } from './dto/register-user.dto.js';
import type { RegisterUserDto } from './dto/register-user.dto.js';
import { AuthService } from './auth.service.js';
@Controller('auth')
export class AuthController {

    constructor(private authService:AuthService) {}

   @Post("/register")
   async register(@Body({schema: registerUserSchema}) payload:RegisterUserDto) {
    await this.authService.registerUser(payload);
   }
}
