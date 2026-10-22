import { IsString, IsUUID, MinLength } from 'class-validator';
export class ResetTeacherPasswordDto {
  @IsUUID() teacherId!: string;
  @IsString() @MinLength(8) newPassword!: string;
}
