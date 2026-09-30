import { IsOptional, IsString, Matches } from 'class-validator';

export class TriggerBuildDto {
  // Не пустая — значит основная ветка проекта. Символы — подмножество допустимых
  // в имени git-ветки; запрет ведущего '-' не даёт git принять имя за опцию.
  @IsOptional()
  @IsString()
  @Matches(/^(?!-)(?!.*\.\.)[A-Za-z0-9._/-]+$/, { message: 'Некорректное имя ветки' })
  branch?: string;
}
