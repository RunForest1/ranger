import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';

export class EnvVariableDto {
  @IsString()
  @Matches(/^[A-Za-z_][A-Za-z0-9_]*$/, { message: 'Имя переменной: латиница, цифры и _, не с цифры' })
  key!: string;

  // Не передано — оставить сохранённое значение: клиент не знает значений (они не
  // возвращаются в API), но должен уметь добавить одну переменную, не вводя заново все.
  @IsOptional()
  @IsString()
  value?: string;
}

export class SetProjectEnvDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => EnvVariableDto)
  variables!: EnvVariableDto[];
}
