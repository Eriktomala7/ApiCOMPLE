import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Rol, Estado } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmailService } from 'src/usuarios/email.service';

type ProductoAgotado = { id: number; nombre: string; codigo: string };
type Administrador = { id: number; nombre: string; email: string };

@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async registrarAgotamiento(
    tx: Prisma.TransactionClient,
    producto: ProductoAgotado,
  ): Promise<Administrador[]> {
    const administradores = await tx.usuario.findMany({
      where: { rol: Rol.ADMIN, estado: Estado.ACTIVO },
      select: { id: true, nombre: true, email: true },
    });

    if (administradores.length === 0) {
      this.logger.warn(
        `El producto ${producto.codigo} se agotó y no hay administradores activos`,
      );
    } else {
      await tx.notificacion.createMany({
        data: administradores.map((administrador) => ({
          id_usuario: administrador.id,
          id_producto: producto.id,
          tipo: 'STOCK_AGOTADO',
          mensaje: `El producto ${producto.nombre} (${producto.codigo}) se agotó y fue deshabilitado.`,
        })),
      });
    }
    return administradores;
  }

  async registrarSolicitudPendiente(
    tx: Prisma.TransactionClient,
    solicitud: {
      id: number;
      id_usuario: number;
      id_producto: number;
      cantidad: number;
      usuario: { nombre: string };
      producto: { nombre: string };
    },
  ): Promise<Administrador[]> {
    const administradores = await tx.usuario.findMany({
      where: { rol: Rol.ADMIN, estado: Estado.ACTIVO },
      select: { id: true, nombre: true, email: true },
    });

    if (administradores.length === 0) {
      this.logger.warn(
        `Solicitud #${solicitud.id} creada; no hay administradores activos para notificar`,
      );
      return administradores;
    }

    await tx.notificacion.createMany({
      data: administradores.map((administrador) => ({
        id_usuario: administrador.id,
        id_solicitud: solicitud.id,
        id_producto: solicitud.id_producto,
        tipo: 'PENDIENTE',
        mensaje: `${solicitud.usuario.nombre} solicitó ${solicitud.cantidad} ${solicitud.producto.nombre}`,
      })),
    });

    return administradores;
  }

  async registrarResultadoSolicitud(
    tx: Prisma.TransactionClient,
    solicitud: {
      id: number;
      id_usuario: number;
      id_producto: number;
      cantidad: number;
      estado_solicitud: 'APROBADA' | 'RECHAZADA';
      producto: { nombre: string };
    },
  ): Promise<void> {
    await tx.notificacion.create({
      data: {
        id_usuario: solicitud.id_usuario,
        id_solicitud: solicitud.id,
        id_producto: solicitud.id_producto,
        tipo: solicitud.estado_solicitud,
        mensaje: `Tu solicitud de ${solicitud.cantidad} ${solicitud.producto.nombre} fue ${
          solicitud.estado_solicitud === 'APROBADA' ? 'aprobada' : 'rechazada'
        }`,
      },
    });
  }

  async enviarAvisosDeAgotamiento(
    producto: ProductoAgotado,
    administradores: Administrador[],
  ): Promise<void> {
    for (const administrador of administradores) {
      try {
        await this.emailService.enviarNotificacionStockAgotado(
          administrador,
          producto,
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `El producto ${producto.codigo} se deshabilitó, pero no se pudo avisar por correo a ${administrador.email}: ${message}`,
        );
      }
    }
  }

  async listarParaAdministrador(id_usuario: number) {
    const notificaciones = await this.prisma.notificacion.findMany({
      where: { id_usuario },
      select: {
        id: true,
        tipo: true,
        mensaje: true,
        fecha: true,
        leida: true,
        producto: {
          select: { id: true, nombre: true, codigo: true, cantidad: true },
        },
      },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: 50,
    });

    return {
      notificaciones,
      total: notificaciones.length,
    };
  }

  async listarSolicitudesParaUsuario(id_usuario: number, tipos: string[]) {
    return this.prisma.notificacion.findMany({
      where: { id_usuario, tipo: { in: tipos } },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: 20,
      select: {
        id: true,
        tipo: true,
        mensaje: true,
        fecha: true,
        leida: true,
      },
    });
  }

  async marcarComoLeida(id: number, id_usuario: number) {
    const result = await this.prisma.notificacion.updateMany({
      where: { id, id_usuario, leida: false },
      data: { leida: true },
    });

    if (result.count === 0) {
      const notification = await this.prisma.notificacion.findFirst({
        where: { id, id_usuario },
        select: { id: true, leida: true },
      });
      if (!notification) {
        throw new NotFoundException('Notificación no encontrada');
      }
      return notification;
    }

    return { id, leida: true };
  }
}
