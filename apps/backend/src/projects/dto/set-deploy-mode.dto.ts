import { IsIn, IsString, Matches } from 'class-validator';

export class SetDeployModeDto {
  @IsIn(['container', 'compose'])
  mode!: 'container' | 'compose';

  // Путь внутри репозитория: без ведущего '/' и без '..', только .yml/.yaml.
  @IsString()
  @Matches(/^(?!\/)(?!.*\.\.)[A-Za-z0-9._/-]+\.ya?ml$/, {
    message: 'Путь к compose-файлу — относительно корня репозитория, .yml или .yaml',
  })
  composeFile!: string;
}
