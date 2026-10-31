import { ConflictException, Injectable, InternalServerErrorException } from '@nestjs/common';
import type { RegisterUserDto } from './dto/register-user.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class AuthService {

    constructor(private prisma:PrismaService, private configService:ConfigService){}

    async registerUser(data:RegisterUserDto):Promise<any> {

        try{
        const {email,name, password, role} = data;
            const saltRounds = this.configService.get<number>('bcrypt_salt_round') ?? 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds!);
            const ifExists = await this.findUserByEmail(email);
            if(ifExists)
            {
                throw new ConflictException("User with this email already exists");
            }

            const user = await this.prisma.user.create({
                data:{
                    email,
                    name,
                    password:hashedPassword,
                    role
                },
                omit:{
                    password:true
                }
            })
            return user;
        }catch(error){
            console.log(error);
            throw new InternalServerErrorException("Error while registering user");
        }
           
    }

    async findUserByEmail(email:string) {
        return await this.prisma.user.findUnique({
            where:{
                email
            }
        })
    }

    

}
