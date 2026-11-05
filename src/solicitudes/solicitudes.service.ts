import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Estado, EstadoSolicitud, TipoMovimiento } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmailService } from 'src/usuarios/email.service';
import { NotificacionesService } from 'src/notificaciones/notificaciones.service';

type AvisoAgotamiento = {
  producto: { id: number; nombre: string; codigo: string };
  administradores: Awaited<
    ReturnType<NotificacionesService['registrarAgotamiento']>
  >;
};

@Injectable()
export class SolicitudesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificacionesService: NotificacionesService,
  ) {}

  // Crear solicitud
  async create(
    id_usuario: number,
    id_producto: number,
    cantidad: number,
    comentario?: string,
  ) {
    const resultado = await this.prisma.$transaction(async (tx) => {
      const producto = await tx.producto.findUnique({
        where: { id: id_producto },
      });
      if (!producto) throw new NotFoundException('Producto no encontrado');

      const solicitud = await tx.solicitud.create({
        data: { id_usuario, id_producto, cantidad, comentario },
        include: {
          usuario: { select: { nombre: true, email: true } },
          producto: { select: { nombre: true } },
        },
      });

      const administradores =
        await this.notificacionesService.registrarSolicitudPendiente(
          tx,
          solicitud,
        );

      return { solicitud, administradores };
    });

    for (const administrador of resultado.administradores) {
      try {
        await this.emailService.enviarNotificacionSolicitud(
          administrador,
          resultado.solicitud,
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `La solicitud #${resultado.solicitud.id} se creó, pero no se pudo notificar a ${administrador.email}: ${message}`,
        );
      }
    }

    return resultado.solicitud;
  }

  // Obtener todas las solicitudes
  async findAll() {
    return this.prisma.solicitud.findMany({
      include: { usuario: true, producto: true },
    });
  }

  // Obtener solicitud por id
  async findOne(id: number) {
    if (!id) {
      throw new BadRequestException('Se requiere un ID válido');
    }

    const solicitud = await this.prisma.solicitud.findUnique({
      where: { id },
      include: {
        usuario: true,
        producto: true,
      },
    });

    if (!solicitud) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    return solicitud;
  }

  // Actualizar datos de la solicitud
  async update(
    id: number,
    cantidad?: number,
    comentario?: string,
    estado?: 'ACTIVO' | 'INACTIVO',
  ) {
    const data: any = {};
    if (cantidad !== undefined) data.cantidad = cantidad;
    if (comentario !== undefined) data.comentario = comentario;
    if (estado !== undefined) data.estado = estado;

    return this.prisma.solicitud.update({
      where: { id },
      data,
    });
  }

  // Actualizar estado de solicitud
  async updateEstado(id: number, estado_solicitud: EstadoSolicitud) {
    const resultado = await this.prisma.$transaction(async (tx) => {
      const solicitud = await tx.solicitud.findUnique({
        where: { id },
        include: { producto: true, usuario: true },
      });

      if (!solicitud) {
        throw new NotFoundException(`Solicitud con id ${id} no encontrada`);
      }

      if (solicitud.estado_solicitud === estado_solicitud) {
        throw new BadRequestException(
          `La solicitud ya tiene estado ${estado_solicitud}`,
        );
      }

      let aviso: AvisoAgotamiento | undefined;

      if (estado_solicitud === EstadoSolicitud.APROBADA) {
        if (solicitud.producto.cantidad < solicitud.cantidad) {
          throw new BadRequestException(
            'No hay stock suficiente para aprobar la solicitud',
          );
        }

        const cantidadNueva = solicitud.producto.cantidad - solicitud.cantidad;
        const seAgoto = solicitud.producto.cantidad > 0 && cantidadNueva === 0;
        await tx.producto.update({
          where: { id: solicitud.id_producto },
          data: {
            cantidad: cantidadNueva,
            ...(cantidadNueva === 0 && { estado: Estado.INACTIVO }),
          },
        });

        await tx.movimiento.create({
          data: {
            id_producto: solicitud.id_producto,
            tipo: TipoMovimiento.SALIDA,
            cantidad: solicitud.cantidad,
            motivo: `Solicitud aprobada id ${id}`,
            id_usuario: solicitud.id_usuario,
          },
        });

        if (seAgoto) {
          const producto = {
            id: solicitud.producto.id,
            nombre: solicitud.producto.nombre,
            codigo: solicitud.producto.codigo,
          };
          aviso = {
            producto,
            administradores:
              await this.notificacionesService.registrarAgotamiento(
                tx,
                producto,
              ),
          };
        }
      }

      const updatedSolicitud = await tx.solicitud.update({
        where: { id },
        data: { estado_solicitud },
      });

      if (
        estado_solicitud === EstadoSolicitud.APROBADA ||
        estado_solicitud === EstadoSolicitud.RECHAZADA
      ) {
        await this.notificacionesService.registrarResultadoSolicitud(tx, {
          id: solicitud.id,
          id_usuario: solicitud.id_usuario,
          id_producto: solicitud.id_producto,
          cantidad: solicitud.cantidad,
          estado_solicitud,
          producto: solicitud.producto,
        });
      }

      return {
        solicitud,
        updatedSolicitud,
        aviso,
      };
    });

    const { solicitud, updatedSolicitud, aviso } = resultado;

    if (
      estado_solicitud === EstadoSolicitud.APROBADA ||
      estado_solicitud === EstadoSolicitud.RECHAZADA
    ) {
      try {
        await this.emailService.enviarResultadoSolicitud(solicitud.usuario, {
          id,
          producto: solicitud.producto,
          cantidad: solicitud.cantidad,
          estado_solicitud,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `No se pudo notificar a ${solicitud.usuario.email}: ${message}`,
        );
      }
    }

    if (aviso) {
      await this.notificacionesService.enviarAvisosDeAgotamiento(
        aviso.producto,
        aviso.administradores,
      );
    }

    return updatedSolicitud;
  }

  // Notificaciones del usuario: solicitudes ya resueltas (aprobadas o rechazadas)
  async findNotificaciones(id_usuario: number) {
    return this.notificacionesService.listarSolicitudesParaUsuario(id_usuario, [
      EstadoSolicitud.APROBADA,
      EstadoSolicitud.RECHAZADA,
    ]);
  }

  // Notificaciones del administrador: solicitudes pendientes de revisión
  async findNotificacionesAdmin(id_usuario: number) {
    return this.notificacionesService.listarSolicitudesParaUsuario(id_usuario, [
      EstadoSolicitud.PENDIENTE,
    ]);
  }

  // Obtener solicitudes de un usuario específico
  async findByUsuario(id_usuario: number) {
    return this.prisma.solicitud.findMany({
      where: {
        id_usuario,
        estado: 'ACTIVO', // Solo solicitudes activas
      },
      include: {
        usuario: true,
        producto: true,
      },
      orderBy: {
        fecha: 'desc', // Más recientes primero
      },
    });
  }

  // Eliminar solicitud (cambiar estado a INACTIVO)
  async remove(id: number) {
    return this.prisma.solicitud.update({
      where: { id },
      data: { estado: Estado.INACTIVO },
    });
  }
}
