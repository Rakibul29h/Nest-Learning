import { IsString } from "class-validator";
import z from "zod";

export const registerUserSchema=z.object({
    email:z.email(),
    password:z.string().min(8),
    name:z.string().min(4,{message:"Name must be at least 4 characters long"}),
    role:z.enum(["USER","ADMIN"],{message:"Role must be either USER or ADMIN"})
})

export type RegisterUserDto = z.infer<typeof registerUserSchema>;