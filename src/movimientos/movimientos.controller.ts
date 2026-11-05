import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { MovimientosService } from './movimientos.service';
import { TipoMovimiento } from 'generated/prisma';


@Controller('movimientos')
export class MovimientosController {
  constructor(private readonly movimientosService: MovimientosService) {}

  @Post()
  async create(@Body() body: any) {
    return this.movimientosService.create(
      body.id_producto,
      body.id_usuario,
      body.tipo as TipoMovimiento,
      body.cantidad,
      body.motivo
    );
  }

  @Get()
  async findAll() {
    return this.movimientosService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.movimientosService.findOne(+id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    return this.movimientosService.update(+id, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.movimientosService.remove(+id);
  }
}
