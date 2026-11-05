// Crear producto con categoría opcional
import {
  Injectable,
  HttpException,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Estado, TipoMovimiento } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { GoogleGenAI } from '@google/genai';
import { NotificacionesService } from 'src/notificaciones/notificaciones.service';

type AvisoAgotamiento = {
  producto: { id: number; nombre: string; codigo: string };
  administradores: Awaited<
    ReturnType<NotificacionesService['registrarAgotamiento']>
  >;
};

@Injectable()
export class ProductosService {
  private genAI: GoogleGenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacionesService: NotificacionesService,
  ) {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY no está configurada en el entorno');
    }

    this.genAI = new GoogleGenAI({ apiKey });
  }

  async create(
    id_usuario: number,
    codigo: string,
    nombre: string,
    descripcion?: string,
    id_category?: number,
    cantidad?: number,
    foto_producto?: string,
  ) {
    const cantidadInicial = cantidad ?? 0;
    if (cantidadInicial < 0) {
      throw new BadRequestException(
        'La cantidad del producto no puede ser negativa',
      );
    }

    // 1. Auditoría Inteligente
    const validation = await this.validarConIA(nombre, descripcion ?? '');

    if (!validation.valido) {
      throw new HttpException(
        `Producto rechazado por la auditoría: ${validation.motivo}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // 2. Preparación de datos (Incluimos el nuevo campo de tu esquema)
    const data: any = {
      codigo,
      nombre,
      descripcion,
      cantidad: cantidadInicial,
      estado: cantidadInicial === 0 ? Estado.INACTIVO : Estado.ACTIVO,
      foto_producto,
      ia_justificacion: validation.motivo, // Se guarda el motivo en Supabase
      ...(id_category && { categoria: { connect: { id: id_category } } }),
    };

    // 3. Transacción SQL
    return this.prisma
      .$transaction(async (tx) => {
        const productoCreado = await tx.producto.create({
          data,
          include: { categoria: true },
        });

        await tx.movimiento.create({
          data: {
            id_producto: productoCreado.id,
            id_usuario: id_usuario,
            tipo: TipoMovimiento.ENTRADA,
            cantidad: cantidadInicial,
            motivo: 'Registro inicial validado por IA',
          },
        });

        if (cantidadInicial === 0) {
          await this.notificacionesService.registrarAgotamiento(tx, {
            id: productoCreado.id,
            nombre: productoCreado.nombre,
            codigo: productoCreado.codigo,
          });
        }

        return productoCreado;
      })
      .catch((e: any) => {
        if (e?.code === 'P2002' && e?.meta?.target?.includes('codigo')) {
          throw new HttpException(
            'El código de producto ya existe',
            HttpStatus.CONFLICT,
          );
        }
        throw e;
      });
  }

  // Listar todos los productos
  async findAll() {
    return this.prisma.producto.findMany({
      include: { categoria: true },
    });
  }

  // Buscar producto por ID
  async findOne(id: number) {
    const producto = await this.prisma.producto.findUnique({
      where: { id },
      include: { categoria: true },
    });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    return producto;
  }

  // ✅ Actualizar producto con ajuste automático (UNA sola transacción)
  async update(
    id: number,
    id_usuario: number,
    datos: {
      codigo?: string;
      nombre?: string;
      descripcion?: string;
      id_category?: number;
      cantidad?: number;
      estado?: string;
      foto_producto?: string | null;
    },
  ) {
    let aviso: AvisoAgotamiento | undefined;
    const productoActualizado = await this.prisma.$transaction(async (tx) => {
      // Obtener producto actual
      const productoActual = await tx.producto.findUnique({
        where: { id },
      });

      if (!productoActual) {
        throw new NotFoundException('Producto no encontrado');
      }

      if (datos.cantidad !== undefined && datos.cantidad < 0) {
        throw new BadRequestException(
          'La cantidad del producto no puede ser negativa',
        );
      }

      // ✅ Crear objeto data con solo campos válidos para producto
      const data: any = {};
      if (datos.codigo !== undefined) data.codigo = datos.codigo;
      if (datos.nombre !== undefined) data.nombre = datos.nombre;
      if (datos.descripcion !== undefined) data.descripcion = datos.descripcion;
      if (datos.cantidad !== undefined) data.cantidad = datos.cantidad;
      if (datos.estado !== undefined) data.estado = datos.estado;
      if (datos.foto_producto !== undefined)
        data.foto_producto = datos.foto_producto;
      if (
        datos.cantidad === 0 ||
        (datos.cantidad === undefined && productoActual.cantidad === 0)
      ) {
        data.estado = Estado.INACTIVO;
      }

      // Manejar categoría
      if (datos.id_category) {
        data.categoria = { connect: { id: datos.id_category } };
      }

      // Si hay cambio en cantidad
      if (
        datos.cantidad !== undefined &&
        datos.cantidad !== productoActual.cantidad
      ) {
        const cantidadNueva = datos.cantidad;
        const seAgoto = productoActual.cantidad > 0 && cantidadNueva === 0;
        if (cantidadNueva === 0) {
          data.estado = Estado.INACTIVO;
        }

        // Actualizar producto
        const productoActualizado = await tx.producto.update({
          where: { id },
          data,
          include: { categoria: true },
        });

        await tx.movimiento.create({
          data: {
            id_producto: id,
            id_usuario: id_usuario,
            tipo: TipoMovimiento.AJUSTE,
            cantidad: cantidadNueva,
            motivo: 'Ajuste de inventario',
          },
        });

        if (seAgoto) {
          const productoAgotado = {
            id: id,
            nombre: datos.nombre ?? productoActual.nombre,
            codigo: datos.codigo ?? productoActual.codigo,
          };
          aviso = {
            producto: productoAgotado,
            administradores:
              await this.notificacionesService.registrarAgotamiento(
                tx,
                productoAgotado,
              ),
          };
        }

        return productoActualizado;
      } else {
        // Sin cambio en cantidad, solo actualizar producto
        return tx.producto.update({
          where: { id },
          data,
          include: { categoria: true },
        });
      }
    });

    if (aviso) {
      await this.notificacionesService.enviarAvisosDeAgotamiento(
        aviso.producto,
        aviso.administradores,
      );
    }

    return productoActualizado;
  }

  // Eliminar producto (cambiar estado a INACTIVO)
  async remove(id: number) {
    return this.prisma.producto.update({
      where: { id },
      data: { estado: 'INACTIVO' },
    });
  }

  async activar(id: number) {
    const producto = await this.prisma.producto.findUnique({ where: { id } });
    if (!producto) {
      throw new NotFoundException('Producto no encontrado');
    }
    if (producto.cantidad <= 0) {
      throw new BadRequestException(
        'No se puede activar un producto sin stock',
      );
    }

    return this.prisma.producto.update({
      where: { id },
      data: { estado: Estado.ACTIVO },
      include: { categoria: true },
    });
  }

  // Obtener productos por categoría
  async findByCategoria(idCategoria: number) {
    return this.prisma.producto.findMany({
      where: {
        id_categoria: idCategoria,
        estado: 'ACTIVO', // Solo productos activos
      },
      include: { categoria: true },
      orderBy: { nombre: 'asc' }, // Ordenar por nombre
    });
  }

  // Obtener estadísticas del dashboard
  async getDashboardStats() {
    const [
      totalProductos,
      totalCategorias,
      totalMovimientos,
      productosBajoStock,
    ] = await Promise.all([
      this.prisma.producto.count({ where: { estado: 'ACTIVO' } }),
      this.prisma.categoria.count({ where: { estado: 'ACTIVO' } }),
      this.prisma.movimiento.count(),
      this.prisma.producto.count({
        where: {
          estado: 'ACTIVO',
          cantidad: {
            lte: 10, // Consideramos bajo stock cuando hay 10 o menos unidades
          },
        },
      }),
    ]);

    return {
      totalProductos,
      totalCategorias,
      totalMovimientos,
      productosBajoStock,
    };
  }

  // Obtener productos con bajo stock
  async getProductosBajoStock() {
    return this.prisma.producto.findMany({
      where: {
        estado: 'ACTIVO',
        cantidad: {
          lte: 10, // Productos con 10 o menos unidades
        },
      },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        cantidad: true,
        categoria: {
          select: {
            nombre: true,
          },
        },
      },
      orderBy: {
        cantidad: 'asc', // Ordenar por cantidad de menor a mayor
      },
    });
  }

  // Obtener movimientos recientes
  async getMovimientosRecientes(limit: number = 10) {
    return this.prisma.movimiento.findMany({
      take: limit,
      orderBy: {
        fecha: 'desc', // Los más recientes Primero
      },
      select: {
        id: true,
        tipo: true,
        cantidad: true,
        fecha: true,
        motivo: true,
        producto: {
          select: {
            id: true,
            nombre: true,
            codigo: true,
          },
        },
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
    });
  }

  // Obtener solicitudes pendientes
  async getSolicitudesPendientes() {
    return this.prisma.solicitud.findMany({
      where: {
        estado_solicitud: 'PENDIENTE',
        estado: 'ACTIVO',
      },
      orderBy: {
        fecha: 'asc', // Las más antiguas Primero
      },
      select: {
        id: true,
        cantidad: true,
        fecha: true,
        comentario: true,
        estado_solicitud: true,
        producto: {
          select: {
            id: true,
            nombre: true,
            codigo: true,
          },
        },
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
    });
  }
  private async validarConIA(nombre: string, descripcion: string) {
    const prompt = `Actúa como un auditor técnico de inventario para la Facultad de Sistemas y Telecomunicaciones (UPSE). Determina si el siguiente artículo pertenece al ámbito de la facultad (Computación, Redes, Software, Electrónica o Mobiliario de oficina técnica). Artículo: "${nombre}" Descripción: "${descripcion}" Responde estrictamente en formato JSON: {"valido": boolean, "motivo": "explicación corta"}`;

    const modelCandidates = ['gemini-2.5-flash', 'gemini-1.5', 'gemini-1.0'];

    for (const modelName of modelCandidates) {
      try {
        const result = await this.genAI.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const parsed = (result as any).parsed;
        let response: any;

        if (parsed && typeof parsed === 'object') {
          response = parsed;
        } else {
          const text = typeof result.text === 'string' ? result.text : '';
          const cleanJson = text.replace(/```json|```/g, '').trim();
          response = JSON.parse(cleanJson);
        }

        if (
          typeof response.valido !== 'boolean' ||
          typeof response.motivo !== 'string'
        ) {
          throw new Error('Respuesta de IA con formato inválido');
        }

        return response;
      } catch (error) {
        const err = error as any;
        console.error(`Error en Gemini con ${modelName}:`, error);

        if (err?.status === 404 || /not found/i.test(err?.message || '')) {
          continue; // siguiente modelo disponible
        }
      }
    }

    console.error('No se pudo validar con ningún modelo IA compatible.');
    return {
      valido: true,
      motivo: 'Validación automática omitida por error técnico',
    };
  }
}
