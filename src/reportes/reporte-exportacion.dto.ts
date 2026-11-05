import { IsIn, IsOptional } from 'class-validator';

export class ReporteExportacionDto {
  @IsOptional()
  @IsIn(['pdf', 'excel'])
  formato?: 'pdf' | 'excel';
}
