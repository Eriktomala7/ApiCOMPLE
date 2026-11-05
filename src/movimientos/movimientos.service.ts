import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Estado, Prisma, TipoMovimiento } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificacionesService } from 'src/notificaciones/notificaciones.service';

type AvisoAgotamiento = {
  producto: { id: number; nombre: string; codigo: string };
  administradores: Awaited<ReturnType<NotificacionesService['registrarAgotamiento']>>;
};

@Injectable()
export class MovimientosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacionesService: NotificacionesService,
  ) {}

  private async registrarAgotamiento(
    tx: Prisma.TransactionClient,
    producto: { id: number; nombre: string; codigo: string; cantidad: number },
    cantidadNueva: number,
  ): Promise<AvisoAgotamiento | undefined> {
    if (producto.cantidad <= 0 || cantidadNueva !== 0) {
      return undefined;
    }

    const datosProducto = {
      id: producto.id,
      nombre: producto.nombre,
      codigo: producto.codigo,
    };

    return {
      producto: datosProducto,
      administradores: await this.notificacionesService.registrarAgotamiento(
        tx,
        datosProducto,
      ),
    };
  }

  private async enviarAvisoAgotamiento(aviso?: AvisoAgotamiento) {
    if (aviso) {
      await this.notificacionesService.enviarAvisosDeAgotamiento(
        aviso.producto,
        aviso.administradores,
      );
    }
  }

  // Crear movimiento (entrada, salida o ajuste)
  async create(
    id_producto: number,
    id_usuario: number,
    tipo: TipoMovimiento,
    cantidad: number,
    motivo?: string
  ) {
    if (![TipoMovimiento.ENTRADA, TipoMovimiento.SALIDA, TipoMovimiento.AJUSTE].includes(tipo)) {
      throw new BadRequestException('Tipo de movimiento inválido');
    }

    if (cantidad === 0 && tipo !== TipoMovimiento.AJUSTE) {
      throw new BadRequestException('La cantidad no puede ser 0');
    }

    if (tipo !== TipoMovimiento.AJUSTE && cantidad < 0) {
      throw new BadRequestException('La cantidad debe ser mayor a 0 para entrada y salida');
    }

    // ✅ Ajuste de stock para SALIDA
    if (tipo === TipoMovimiento.SALIDA) {
      const resultado = await this.prisma.$transaction(async (tx) => {
        const producto = await tx.producto.findUnique({ where: { id: id_producto } });
        if (!producto) throw new NotFoundException('Producto no encontrado');

        if (producto.cantidad < cantidad) {
          throw new BadRequestException('No hay suficiente stock para la salida');
        }

        const cantidadNueva = producto.cantidad - cantidad;
        const aviso = await this.registrarAgotamiento(tx, producto, cantidadNueva);

        await tx.producto.update({
          where: { id: id_producto },
          data: {
            cantidad: cantidadNueva,
            ...(cantidadNueva === 0 && { estado: Estado.INACTIVO }),
          },
        });

        const movimiento = await tx.movimiento.create({
          data: { id_producto, id_usuario, tipo, cantidad, motivo },
        });

        return { movimiento, aviso };
      });

      await this.enviarAvisoAgotamiento(resultado.aviso);
      return resultado.movimiento;
    }

    // ✅ Ajuste de stock para AJUSTE
    if (tipo === TipoMovimiento.AJUSTE) {
      if (cantidad < 0) {
        throw new BadRequestException('La cantidad del ajuste debe ser igual o mayor a 0');
      }

      const resultado = await this.prisma.$transaction(async (tx) => {
        const producto = await tx.producto.findUnique({ where: { id: id_producto } });
        if (!producto) throw new NotFoundException('Producto no encontrado');

        const aviso = await this.registrarAgotamiento(tx, producto, cantidad);
        await tx.producto.update({
          where: { id: id_producto },
          data: {
            cantidad,
            ...(cantidad === 0 && { estado: Estado.INACTIVO }),
          },
        });

        const movimiento = await tx.movimiento.create({
          data: { id_producto, id_usuario, tipo, cantidad, motivo },
        });

        return { movimiento, aviso };
      });

      await this.enviarAvisoAgotamiento(resultado.aviso);
      return resultado.movimiento;
    }

    // ✅ ENTRADA: suma stock y registra el movimiento
    return this.prisma.$transaction(async (tx) => {
      const producto = await tx.producto.findUnique({ where: { id: id_producto } });
      if (!producto) throw new NotFoundException('Producto no encontrado');

      await tx.producto.update({
        where: { id: id_producto },
        data: { cantidad: producto.cantidad + cantidad },
      });

      return tx.movimiento.create({
        data: {
          id_producto,
          id_usuario,
          tipo,
          cantidad,
          motivo,
        },
      });
    });
  }

  async findAll() {
    return this.prisma.movimiento.findMany({
      include: { producto: true, usuario: true },
    });
  }

  async findOne(id: number) {
    const movimiento = await this.prisma.movimiento.findUnique({
      where: { id },
      include: { producto: true, usuario: true },
    });
    if (!movimiento) throw new NotFoundException('Movimiento no encontrado');
    return movimiento;
  }

  async update(id: number, datos: { cantidad?: number; motivo?: string }) {
    if (datos.cantidad !== undefined && datos.cantidad < 0) {
      throw new BadRequestException('La cantidad no puede ser negativa');
    }

    const resultado = await this.prisma.$transaction(async (tx) => {
      const movimiento = await tx.movimiento.findUnique({
        where: { id },
        include: { producto: true },
      });
      if (!movimiento) throw new NotFoundException('Movimiento no encontrado');

      if (datos.cantidad !== undefined) {
        const aviso = await this.registrarAgotamiento(
          tx,
          movimiento.producto,
          datos.cantidad,
        );
        await tx.producto.update({
          where: { id: movimiento.id_producto },
          data: {
            cantidad: datos.cantidad,
            ...(datos.cantidad === 0 && { estado: Estado.INACTIVO }),
          },
        });

        return {
          movimiento: await tx.movimiento.update({
            where: { id },
            data: { ...datos, tipo: TipoMovimiento.AJUSTE },
          }),
          aviso,
        };
      }

      return {
        movimiento: await tx.movimiento.update({
          where: { id },
          data: datos,
        }),
        aviso: undefined,
      };
    });

    await this.enviarAvisoAgotamiento(resultado.aviso);
    return resultado.movimiento;
  }

  async remove(id: number) {
    return this.prisma.movimiento.update({
      where: { id },
      data: { estado: 'INACTIVO' },
    });
  }
}