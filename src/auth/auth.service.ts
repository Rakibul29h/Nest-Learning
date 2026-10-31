import { Injectable } from '@nestjs/common';
import type { RegisterUserDto } from './dto/register-user.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class AuthService {

    constructor(private prisma:PrismaService, private configService:ConfigService) {}

    async registerUser(data:RegisterUserDto) {
            console.log(this.configService.get<number>('bcrypt_salt_round')+ " bcrypt salt round");
            console.log(data);
    }

    async hashedPassword(password:string):Promise<string> {
        return await bcrypt.hash(password,this.configService.get<number>('bcrypt_salt_round')!);
    }

}
