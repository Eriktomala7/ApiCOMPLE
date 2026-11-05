import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { ReporteExportacionDto } from './reporte-exportacion.dto';
import { transformarBooleanoQuery } from './reporte-query.transformer';

export class ReporteInventarioDto extends ReporteExportacionDto {
  @ApiPropertyOptional({
    description: 'Tipo de reporte: "categoria" o "producto"',
    enum: ['categoria', 'producto'],
    default: 'producto',
  })
  @IsOptional()
  @IsIn(['categoria', 'producto'])
  tipo?: 'categoria' | 'producto';

  @ApiPropertyOptional({
    description: 'ID de la categoría para filtrar productos',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoriaId?: number;

  @ApiPropertyOptional({
    description: 'Cantidad mínima disponible para incluir un producto',
    example: 5,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockMinimo?: number = 0;

  @ApiPropertyOptional({
    description: 'Incluir productos sin stock',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => transformarBooleanoQuery(value))
  @IsBoolean()
  incluirSinStock?: boolean = false;
}
