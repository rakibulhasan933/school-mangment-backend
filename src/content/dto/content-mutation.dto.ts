import { IsObject } from 'class-validator';
export class ContentMutationDto {
  @IsObject() value!: Record<string, unknown>;
}
