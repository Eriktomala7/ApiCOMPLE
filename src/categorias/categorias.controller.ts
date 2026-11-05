import { Controller, Get, Post, Put, Delete, Param, Body, ParseIntPipe } from '@nestjs/common';
import { CategoriasService } from './categorias.service';

@Controller('categorias')
export class CategoriasController {
  constructor(private readonly categoriasService: CategoriasService) {}

  // Crear categoría
  @Post()
  async create(
    @Body('nombre') nombre: string,
    @Body('descripcion') descripcion?: string,
  ) {
    return this.categoriasService.create(nombre, descripcion);
  }

  // Obtener todas las categorías
  @Get()
  async findAll() {
    return this.categoriasService.findAll();
  }

  // Obtener categoría por id
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.categoriasService.findOne(id);
  }

  // Actualizar categoría
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body('nombre') nombre?: string,
    @Body('descripcion') descripcion?: string,
    @Body('estado') estado?: 'ACTIVO' | 'INACTIVO',
  ) {
    return this.categoriasService.update(id, nombre, descripcion, estado);
  }

  // Eliminar categoría (marcar como inactivo)
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.categoriasService.remove(id);
  }
}
