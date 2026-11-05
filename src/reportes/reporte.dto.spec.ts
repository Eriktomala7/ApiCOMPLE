import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TipoMovimiento } from '@prisma/client';
import { ReporteInventarioDto } from './reporte-inventario.dto';
import { ReporteMovimientosDto } from './reporte-movimientos.dto';
import { ReporteStockDto } from './reporte-stock.dto';

describe('Report query DTOs', () => {
  it('converts inventory query parameters and accepts export format', async () => {
    const filtros = plainToInstance(ReporteInventarioDto, {
      categoriaId: '4',
      stockMinimo: '7',
      incluirSinStock: 'false',
      formato: 'excel',
    });

    await expect(validate(filtros)).resolves.toHaveLength(0);
    expect(filtros).toMatchObject({
      categoriaId: 4,
      stockMinimo: 7,
      incluirSinStock: false,
      formato: 'excel',
    });
  });

  it('normalizes movement type and validates movement filters', async () => {
    const filtros = plainToInstance(ReporteMovimientosDto, {
      fechaInicio: '2026-10-01',
      fechaFin: '2026-10-31',
      tipoMovimiento: 'salida',
      categoriaId: '2',
    });

    await expect(validate(filtros)).resolves.toHaveLength(0);
    expect(filtros.tipoMovimiento).toBe(TipoMovimiento.SALIDA);
    expect(filtros.categoriaId).toBe(2);
  });

  it('parses false correctly for the low-stock filter', async () => {
    const filtros = plainToInstance(ReporteStockDto, {
      stockMinimo: '12',
      soloBajoStock: 'false',
    });

    await expect(validate(filtros)).resolves.toHaveLength(0);
    expect(filtros.stockMinimo).toBe(12);
    expect(filtros.soloBajoStock).toBe(false);
  });
});
