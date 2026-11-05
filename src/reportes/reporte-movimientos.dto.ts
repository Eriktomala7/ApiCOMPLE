import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { TipoMovimiento } from '@prisma/client';
import { ReporteExportacionDto } from './reporte-exportacion.dto';
import { transformarTipoMovimientoQuery } from './reporte-query.transformer';

export class ReporteMovimientosDto extends ReporteExportacionDto {
  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaFin?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productoId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoriaId?: number;

  @IsOptional()
  @Transform(({ value }) => transformarTipoMovimientoQuery(value))
  @IsEnum(TipoMovimiento)
  tipoMovimiento?: TipoMovimiento;
}
