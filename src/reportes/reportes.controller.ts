import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { ReportesService } from './reportes.service';
import { ReporteInventarioDto } from './reporte-inventario.dto';
import { ReporteMovimientosDto } from './reporte-movimientos.dto';
import { ReporteStockDto } from './reporte-stock.dto';

type UsuarioAutenticado = { user: { id: number; rol: string } };

@Controller('reportes')
@UseGuards(AuthGuard('jwt'))
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get('inventario')
  async reporteInventario(
    @Query() filtros: ReporteInventarioDto,
    @Req() request: UsuarioAutenticado,
  ) {
    this.validarAdministrador(request);
    return {
      success: true,
      data: await this.reportesService.generarReporteInventario(filtros),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('movimientos')
  async reporteMovimientos(
    @Query() filtros: ReporteMovimientosDto,
    @Req() request: UsuarioAutenticado,
  ) {
    this.validarAdministrador(request);
    return {
      success: true,
      data: await this.reportesService.generarReporteMovimientos(filtros),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('producto-mas-movimientos')
  async reporteProductoConMasMovimientos(@Req() request: UsuarioAutenticado) {
    this.validarAdministrador(request);
    return {
      success: true,
      data: await this.reportesService.generarReporteProductoConMasMovimientos(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('bajo-stock')
  async reporteBajoStock(
    @Query() filtros: ReporteStockDto,
    @Req() request: UsuarioAutenticado,
  ) {
    this.validarAdministrador(request);
    return {
      success: true,
      data: await this.reportesService.generarReporteBajoStock(filtros),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('inventario/exportar')
  async exportarInventario(
    @Query() filtros: ReporteInventarioDto,
    @Req() request: UsuarioAutenticado,
    @Res() response: Response,
  ) {
    this.validarAdministrador(request);
    const archivo = await this.reportesService.exportarInventario(
      filtros,
      filtros.formato ?? '',
    );
    return this.enviarArchivo(response, archivo);
  }

  @Get('movimientos/exportar')
  async exportarMovimientos(
    @Query() filtros: ReporteMovimientosDto,
    @Req() request: UsuarioAutenticado,
    @Res() response: Response,
  ) {
    this.validarAdministrador(request);
    const archivo = await this.reportesService.exportarMovimientos(
      filtros,
      filtros.formato ?? '',
    );
    return this.enviarArchivo(response, archivo);
  }

  @Get('bajo-stock/exportar')
  async exportarBajoStock(
    @Query() filtros: ReporteStockDto,
    @Req() request: UsuarioAutenticado,
    @Res() response: Response,
  ) {
    this.validarAdministrador(request);
    const archivo = await this.reportesService.exportarBajoStock(
      filtros,
      filtros.formato ?? '',
    );
    return this.enviarArchivo(response, archivo);
  }

  private validarAdministrador(request: UsuarioAutenticado) {
    if (request.user.rol !== 'ADMIN') {
      throw new ForbiddenException(
        'Solo un administrador puede consultar reportes',
      );
    }
  }

  private enviarArchivo(
    response: Response,
    archivo: { buffer: Buffer; contentType: string; filename: string },
  ) {
    response.setHeader('Content-Type', archivo.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${archivo.filename}"`,
    );
    response.setHeader('Content-Length', archivo.buffer.length);
    return response.send(archivo.buffer);
  }
}
