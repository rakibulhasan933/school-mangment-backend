import { IsString, Matches } from "class-validator";

export class StudentLoginDto {
  @IsString()
  @Matches(/^\d{8}$/, { message: "রেজিস্ট্রেশন নম্বর ৮ সংখ্যার হতে হবে" })
  registrationNumber!: string;
}
