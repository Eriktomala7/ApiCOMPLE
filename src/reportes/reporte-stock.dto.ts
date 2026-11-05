import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';
import { ReporteExportacionDto } from './reporte-exportacion.dto';
import { transformarBooleanoQuery } from './reporte-query.transformer';

export class ReporteStockDto extends ReporteExportacionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoriaId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockMinimo: number = 5;

  @IsOptional()
  @Transform(({ value }) => transformarBooleanoQuery(value))
  @IsBoolean()
  soloBajoStock: boolean = true;
}
