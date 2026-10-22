import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
export class PublicMessageDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MinLength(8) @MaxLength(30) mobile!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() @MinLength(2) @MaxLength(180) subject!: string;
  @IsOptional() @IsString() @MinLength(5) @MaxLength(5000) message?: string;
  @IsOptional() @IsString() @MinLength(5) @MaxLength(5000) description?: string;
}
