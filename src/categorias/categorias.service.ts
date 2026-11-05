import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CategoriasService {
  constructor(private readonly prisma: PrismaService) {}

  // Crear categoría
  async create(nombre: string, descripcion?: string) {
    return this.prisma.categoria.create({
      data: { nombre, descripcion },
    });
  }

  // Obtener todas las categorías
  async findAll() {
    return this.prisma.categoria.findMany();
  }

  // Obtener categoría por id
  async findOne(id: number) {
    const categoria = await this.prisma.categoria.findUnique({
      where: { id },
    });
    if (!categoria) throw new NotFoundException('Categoría no encontrada');
    return categoria;
  }

  // Actualizar categoría
  async update(id: number, nombre?: string, descripcion?: string, estado?: 'ACTIVO' | 'INACTIVO') {
    return this.prisma.categoria.update({
      where: { id },
      data: { 
        ...(nombre && { nombre }),
        ...(descripcion !== undefined && { descripcion }),
        ...(estado && { estado })
      },
    });
  }

  // Eliminar categoría (marcar como inactivo)
  async remove(id: number) {
    return this.prisma.categoria.update({
      where: { id },
      data: { estado: 'INACTIVO' },
    });
  }
}
