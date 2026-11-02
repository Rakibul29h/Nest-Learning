import { IsString } from "class-validator";
import z from "zod";

export const logInUserSchema=z.object({
    email:z.email({message:"Invalid email address"}),
    password:z.string().min(8,{message:"Password must be at least 8 characters long"}),
})

export type logInUserDto = z.infer<typeof logInUserSchema>;