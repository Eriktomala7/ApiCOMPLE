import { BadRequestException, Injectable } from '@nestjs/common';
import { Estado, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { ReporteInventarioDto } from './reporte-inventario.dto';
import { ReporteMovimientosDto } from './reporte-movimientos.dto';
import { ReporteStockDto } from './reporte-stock.dto';

type FormatoReporte = 'pdf' | 'excel';
type ColumnaReporte = { encabezado: string; clave: string; ancho: number };
type ProductoInventario = Prisma.ProductoGetPayload<{
  include: { categoria: { select: { id: true; nombre: true } } };
}>;
type CategoriaInventario = {
  categoria: string;
  totalProductos: number;
  cantidadTotal: number;
};

@Injectable()
export class ReportesService {
  constructor(private readonly prisma: PrismaService) {}

  generarReporteInventario(
    filtros: ReporteInventarioDto & { tipo: 'categoria' },
  ): Promise<CategoriaInventario[]>;
  generarReporteInventario(
    filtros: ReporteInventarioDto & { tipo?: 'producto' },
  ): Promise<ProductoInventario[]>;
  generarReporteInventario(
    filtros: ReporteInventarioDto,
  ): Promise<ProductoInventario[] | CategoriaInventario[]>;
  async generarReporteInventario(
    filtros: ReporteInventarioDto,
  ): Promise<ProductoInventario[] | CategoriaInventario[]> {
    const where: Prisma.ProductoWhereInput = {
      estado: Estado.ACTIVO,
      ...(filtros.categoriaId && { id_categoria: filtros.categoriaId }),
    };
    where.cantidad = filtros.incluirSinStock
      ? { gte: filtros.stockMinimo ?? 0 }
      : { gt: 0, gte: filtros.stockMinimo ?? 0 };

    const productos = await this.prisma.producto.findMany({
      where,
      include: {
        categoria: true,
        movimientos: {
          orderBy: { fecha: 'desc' },
          take: 10,
        },
      },
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    });

    if (filtros.tipo !== 'categoria') {
      return productos;
    }

    const categorias = new Map<number | null, CategoriaInventario>();

    for (const producto of productos) {
      const idCategoria = producto.id_categoria;
      const actual = categorias.get(idCategoria) ?? {
        categoria: producto.categoria?.nombre ?? 'Sin categoría',
        totalProductos: 0,
        cantidadTotal: 0,
      };
      actual.totalProductos += 1;
      actual.cantidadTotal += producto.cantidad;
      categorias.set(idCategoria, actual);
    }

    return Array.from(categorias.values()).sort((a, b) =>
      a.categoria.localeCompare(b.categoria),
    );
  }

  async generarReporteMovimientos(filtros: ReporteMovimientosDto) {
    if (Boolean(filtros.fechaInicio) !== Boolean(filtros.fechaFin)) {
      throw new BadRequestException(
        'Debe proporcionar fechaInicio y fechaFin juntas',
      );
    }

    const where: Prisma.MovimientoWhereInput = { estado: Estado.ACTIVO };

    if (filtros.fechaInicio && filtros.fechaFin) {
      const fechaInicio = new Date(filtros.fechaInicio);
      const fechaFin = this.fechaFinalInclusiva(filtros.fechaFin);
      if (fechaInicio > fechaFin) {
        throw new BadRequestException(
          'fechaInicio debe ser anterior o igual a fechaFin',
        );
      }
      where.fecha = { gte: fechaInicio, lte: fechaFin };
    }

    if (filtros.tipoMovimiento) {
      where.tipo = filtros.tipoMovimiento;
    }

    if (filtros.productoId) {
      where.id_producto = filtros.productoId;
    }

    if (filtros.categoriaId) {
      where.producto = { id_categoria: filtros.categoriaId };
    }

    return this.prisma.movimiento.findMany({
      where,
      include: {
        producto: { include: { categoria: true } },
        usuario: { select: { id: true, nombre: true, email: true } },
      },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    });
  }

  async generarReporteProductoConMasMovimientos() {
    const [resultado] = await this.prisma.movimiento.groupBy({
      by: ['id_producto'],
      where: { estado: Estado.ACTIVO },
      _count: { id: true },
      orderBy: [{ _count: { id: 'desc' } }, { id_producto: 'asc' }],
      take: 1,
    });

    if (!resultado) {
      return null;
    }

    const producto = await this.prisma.producto.findUnique({
      where: { id: resultado.id_producto },
      include: { categoria: true },
    });

    if (!producto) {
      return null;
    }

    return {
      producto,
      totalMovimientos: resultado._count.id,
    };
  }

  async generarReporteBajoStock(filtros: ReporteStockDto) {
    const where: Prisma.ProductoWhereInput = {
      OR: [{ estado: Estado.ACTIVO }, { cantidad: 0 }],
      ...(filtros.soloBajoStock !== false && {
        cantidad: { lte: filtros.stockMinimo ?? 5 },
      }),
      ...(filtros.categoriaId && { id_categoria: filtros.categoriaId }),
    };

    const productos = await this.prisma.producto.findMany({
      where,
      include: { categoria: true },
      orderBy: [{ cantidad: 'asc' }, { nombre: 'asc' }],
    });

    return productos.map((producto) => ({
      ...producto,
      stock_minimo: filtros.stockMinimo ?? 5,
      categoria: producto.categoria?.nombre ?? null,
    }));
  }

  async exportarInventario(filtros: ReporteInventarioDto, formato: string) {
    const formatoValidado = this.validarFormato(formato);
    if (filtros.tipo === 'categoria') {
      const data = await this.generarReporteInventario({
        ...filtros,
        tipo: 'categoria',
      });
      return this.exportar(
        'reporte-inventario',
        'Inventario por categoría',
        [
          { encabezado: 'Categoría', clave: 'categoria', ancho: 30 },
          {
            encabezado: 'Total de productos',
            clave: 'totalProductos',
            ancho: 20,
          },
          { encabezado: 'Cantidad total', clave: 'cantidadTotal', ancho: 20 },
        ],
        data,
        formatoValidado,
      );
    }

    const data = await this.generarReporteInventario({
      ...filtros,
      tipo: 'producto',
    });
    return this.exportar(
      'reporte-inventario',
      'Reporte de inventario',
      [
        { encabezado: 'Código', clave: 'codigo', ancho: 18 },
        { encabezado: 'Producto', clave: 'nombre', ancho: 30 },
        { encabezado: 'Categoría', clave: 'categoria', ancho: 24 },
        { encabezado: 'Cantidad', clave: 'cantidad', ancho: 14 },
        { encabezado: 'Estado', clave: 'estado', ancho: 14 },
      ],
      data.map((item) => ({
        codigo: item.codigo,
        nombre: item.nombre,
        categoria: item.categoria?.nombre ?? 'Sin categoría',
        cantidad: item.cantidad,
        estado: item.estado ?? 'ACTIVO',
      })),
      formatoValidado,
    );
  }

  async exportarMovimientos(filtros: ReporteMovimientosDto, formato: string) {
    const formatoValidado = this.validarFormato(formato);
    const movimientos = await this.generarReporteMovimientos(filtros);
    return this.exportar(
      'reporte-movimientos',
      'Reporte de movimientos',
      [
        { encabezado: 'Fecha', clave: 'fecha', ancho: 22 },
        { encabezado: 'Producto', clave: 'producto', ancho: 28 },
        { encabezado: 'Código', clave: 'codigo', ancho: 16 },
        { encabezado: 'Categoría', clave: 'categoria', ancho: 22 },
        { encabezado: 'Tipo', clave: 'tipo', ancho: 14 },
        { encabezado: 'Cantidad', clave: 'cantidad', ancho: 14 },
        { encabezado: 'Usuario', clave: 'usuario', ancho: 24 },
        { encabezado: 'Motivo', clave: 'motivo', ancho: 32 },
      ],
      movimientos.map((movimiento) => ({
        fecha: movimiento.fecha,
        producto: movimiento.producto.nombre,
        codigo: movimiento.producto.codigo,
        categoria: movimiento.producto.categoria?.nombre ?? 'Sin categoría',
        tipo: movimiento.tipo,
        cantidad: movimiento.cantidad,
        usuario: movimiento.usuario.nombre,
        motivo: movimiento.motivo ?? '',
      })),
      formatoValidado,
    );
  }

  async exportarBajoStock(filtros: ReporteStockDto, formato: string) {
    const formatoValidado = this.validarFormato(formato);
    const productos = await this.generarReporteBajoStock(filtros);
    return this.exportar(
      'reporte-bajo-stock',
      'Reporte de productos con bajo stock',
      [
        { encabezado: 'Código', clave: 'codigo', ancho: 18 },
        { encabezado: 'Producto', clave: 'nombre', ancho: 30 },
        { encabezado: 'Categoría', clave: 'categoria', ancho: 24 },
        { encabezado: 'Cantidad actual', clave: 'cantidad', ancho: 18 },
        { encabezado: 'Stock mínimo', clave: 'stockMinimo', ancho: 16 },
        { encabezado: 'Estado', clave: 'estado', ancho: 14 },
      ],
      productos.map((producto) => ({
        codigo: producto.codigo,
        nombre: producto.nombre,
        categoria: producto.categoria ?? 'Sin categoría',
        cantidad: producto.cantidad,
        stockMinimo: producto.stock_minimo,
        estado: producto.estado ?? 'ACTIVO',
      })),
      formatoValidado,
    );
  }

  private validarFormato(formato: string): FormatoReporte {
    if (formato !== 'pdf' && formato !== 'excel') {
      throw new BadRequestException('El formato debe ser "pdf" o "excel"');
    }
    return formato;
  }

  private fechaFinalInclusiva(fecha: string): Date {
    const fechaFin = new Date(fecha);
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      fechaFin.setUTCHours(23, 59, 59, 999);
    }
    return fechaFin;
  }

  private async exportar(
    nombre: string,
    titulo: string,
    columnas: ColumnaReporte[],
    filas: Record<string, string | number | Date | null>[],
    formato: FormatoReporte,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    if (formato === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Reporte');
      worksheet.columns = columnas.map((columna) => ({
        header: columna.encabezado,
        key: columna.clave,
        width: columna.ancho,
      }));
      worksheet.addRows(filas);
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E78' },
      };
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: columnas.length },
      };

      const output = await workbook.xlsx.writeBuffer();
      return {
        buffer: Buffer.from(output),
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `${nombre}.xlsx`,
      };
    }

    if (formato === 'pdf') {
      const buffer = await this.generarPdf(titulo, columnas, filas);
      return {
        buffer,
        contentType: 'application/pdf',
        filename: `${nombre}.pdf`,
      };
    }

    throw new BadRequestException('El formato debe ser "pdf" o "excel"');
  }

  private generarPdf(
    titulo: string,
    columnas: ColumnaReporte[],
    filas: Record<string, string | number | Date | null>[],
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 36,
        bufferPages: true,
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      const pageWidth =
        doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const anchoTotal = columnas.reduce(
        (total, columna) => total + columna.ancho,
        0,
      );
      const altoFila = 28;
      let y = 44;

      const dibujarEncabezados = () => {
        doc.fontSize(8).font('Helvetica-Bold');
        let x = doc.page.margins.left;
        columnas.forEach((columna) => {
          const anchoColumna = (pageWidth * columna.ancho) / anchoTotal;
          doc.rect(x, y, anchoColumna, altoFila).fill('#1F4E78');
          doc.fillColor('#FFFFFF').text(columna.encabezado, x + 4, y + 8, {
            width: anchoColumna - 8,
            height: altoFila - 8,
            ellipsis: true,
          });
          x += anchoColumna;
        });
        y += altoFila;
        doc.fillColor('#000000');
      };

      doc.fontSize(16).font('Helvetica-Bold').text(titulo, {
        align: 'center',
      });
      doc.moveDown(0.5);
      doc
        .fontSize(8)
        .font('Helvetica')
        .text(`Generado: ${new Date().toLocaleString('es-MX')}`, {
          align: 'right',
        });
      y = doc.y + 16;
      dibujarEncabezados();

      filas.forEach((fila, filaIndex) => {
        if (y + altoFila > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          y = doc.page.margins.top;
          dibujarEncabezados();
        }

        doc.fontSize(8).font('Helvetica');
        let x = doc.page.margins.left;
        columnas.forEach((columna) => {
          const anchoColumna = (pageWidth * columna.ancho) / anchoTotal;
          if (filaIndex % 2 === 0) {
            doc.rect(x, y, anchoColumna, altoFila).fill('#F2F6FA');
          }
          const valor = fila[columna.clave];
          const texto =
            valor instanceof Date
              ? valor.toLocaleString('es-MX')
              : valor === null || valor === undefined
                ? ''
                : String(valor);
          doc.fillColor('#000000').text(texto, x + 4, y + 8, {
            width: anchoColumna - 8,
            height: altoFila - 8,
            ellipsis: true,
          });
          x += anchoColumna;
        });
        y += altoFila;
      });

      if (filas.length === 0) {
        doc
          .fontSize(10)
          .font('Helvetica')
          .text(
            'No hay registros para los filtros seleccionados.',
            doc.page.margins.left,
            y + 12,
          );
      }

      doc.end();
    });
  }
}
