import { BadRequestException } from '@nestjs/common';
import { Estado, TipoMovimiento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportesService } from './reportes.service';

describe('ReportesService', () => {
  const prisma = {
    producto: { findMany: jest.fn(), findUnique: jest.fn() },
    movimiento: { findMany: jest.fn(), groupBy: jest.fn() },
  };
  let service: ReportesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReportesService(prisma as unknown as PrismaService);
  });

  it('applies inventory stock, category, and no-stock filters', async () => {
    prisma.producto.findMany.mockResolvedValue([]);

    await service.generarReporteInventario({
      categoriaId: 3,
      stockMinimo: 5,
      incluirSinStock: false,
    });

    expect(prisma.producto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          estado: Estado.ACTIVO,
          cantidad: { gt: 0, gte: 5 },
          id_categoria: 3,
        },
      }),
    );
    expect(prisma.producto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          categoria: true,
          movimientos: { orderBy: { fecha: 'desc' }, take: 10 },
        },
      }),
    );
  });

  it('aggregates the inventory by category when requested', async () => {
    prisma.producto.findMany.mockResolvedValue([
      {
        id_categoria: 2,
        cantidad: 4,
        categoria: { id: 2, nombre: 'Papelería' },
      },
      {
        id_categoria: 2,
        cantidad: 6,
        categoria: { id: 2, nombre: 'Papelería' },
      },
      { id_categoria: null, cantidad: 3, categoria: null },
    ]);

    await expect(
      service.generarReporteInventario({ tipo: 'categoria' }),
    ).resolves.toEqual([
      {
        categoria: 'Papelería',
        totalProductos: 2,
        cantidadTotal: 10,
      },
      {
        categoria: 'Sin categoría',
        totalProductos: 1,
        cantidadTotal: 3,
      },
    ]);
  });

  it('filters movements by inclusive dates, category, product, and enum type', async () => {
    prisma.movimiento.findMany.mockResolvedValue([]);

    await service.generarReporteMovimientos({
      fechaInicio: '2026-10-01',
      fechaFin: '2026-10-05',
      categoriaId: 7,
      productoId: 4,
      tipoMovimiento: TipoMovimiento.SALIDA,
    });

    expect(prisma.movimiento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          estado: Estado.ACTIVO,
          fecha: {
            gte: new Date('2026-10-01'),
            lte: new Date('2026-10-05T23:59:59.999Z'),
          },
          tipo: TipoMovimiento.SALIDA,
          id_producto: 4,
          producto: { id_categoria: 7 },
        },
      }),
    );
  });

  it('rejects incomplete or reversed movement date ranges', async () => {
    await expect(
      service.generarReporteMovimientos({ fechaInicio: '2026-10-01' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.generarReporteMovimientos({
        fechaInicio: '2026-10-06',
        fechaFin: '2026-10-05',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.movimiento.findMany).not.toHaveBeenCalled();
  });

  it('returns the product with the highest number of active movements', async () => {
    const producto = {
      id: 9,
      nombre: 'Teclado',
      categoria: { id: 2, nombre: 'Accesorios' },
    };
    prisma.movimiento.groupBy.mockResolvedValue([
      { id_producto: 9, _count: { id: 14 } },
    ]);
    prisma.producto.findUnique.mockResolvedValue(producto);

    await expect(
      service.generarReporteProductoConMasMovimientos(),
    ).resolves.toEqual({ producto, totalMovimientos: 14 });

    expect(prisma.movimiento.groupBy).toHaveBeenCalledWith({
      by: ['id_producto'],
      where: { estado: Estado.ACTIVO },
      _count: { id: true },
      orderBy: [{ _count: { id: 'desc' } }, { id_producto: 'asc' }],
      take: 1,
    });
    expect(prisma.producto.findUnique).toHaveBeenCalledWith({
      where: { id: 9 },
      include: { categoria: true },
    });
  });

  it('returns null when no active movements exist', async () => {
    prisma.movimiento.groupBy.mockResolvedValue([]);

    await expect(
      service.generarReporteProductoConMasMovimientos(),
    ).resolves.toBeNull();
    expect(prisma.producto.findUnique).not.toHaveBeenCalled();
  });

  it('uses the requested threshold and includes exhausted products in low-stock reports', async () => {
    prisma.producto.findMany.mockResolvedValue([
      {
        id: 8,
        cantidad: 0,
        categoria: { id: 5, nombre: 'Papelería' },
      },
    ]);

    const result = await service.generarReporteBajoStock({
      categoriaId: 5,
      stockMinimo: 8,
      soloBajoStock: true,
    });

    expect(prisma.producto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ estado: Estado.ACTIVO }, { cantidad: 0 }],
          cantidad: { lte: 8 },
          id_categoria: 5,
        },
      }),
    );
    expect(result).toEqual([
      {
        id: 8,
        cantidad: 0,
        categoria: 'Papelería',
        stock_minimo: 8,
      },
    ]);
  });

  it('exports report data as Excel and PDF', async () => {
    prisma.producto.findMany.mockResolvedValue([]);

    const excel = await service.exportarInventario({}, 'excel');
    const pdf = await service.exportarInventario({}, 'pdf');

    expect(excel.contentType).toContain('spreadsheetml');
    expect(excel.filename).toBe('reporte-inventario.xlsx');
    expect(excel.buffer.subarray(0, 2).toString()).toBe('PK');
    expect(pdf.contentType).toBe('application/pdf');
    expect(pdf.filename).toBe('reporte-inventario.pdf');
    expect(pdf.buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
