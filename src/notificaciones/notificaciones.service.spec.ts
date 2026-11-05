import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmailService } from 'src/usuarios/email.service';
import { NotificacionesService } from './notificaciones.service';

describe('NotificacionesService', () => {
  let service: NotificacionesService;
  const prisma = {
    notificacion: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificacionesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: {} },
      ],
    }).compile();

    service = module.get<NotificacionesService>(NotificacionesService);
  });

  it('marks a notification read only for its owner', async () => {
    prisma.notificacion.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.marcarComoLeida(18, 7)).resolves.toEqual({
      id: 18,
      leida: true,
    });

    expect(prisma.notificacion.updateMany).toHaveBeenCalledWith({
      where: { id: 18, id_usuario: 7, leida: false },
      data: { leida: true },
    });
  });

  it('persists stock depletion notifications for each active administrator', async () => {
    const tx = {
      usuario: {
        findMany: jest.fn().mockResolvedValue([
          { id: 2, nombre: 'Admin 1', email: 'admin1@example.com' },
          { id: 3, nombre: 'Admin 2', email: 'admin2@example.com' },
        ]),
      },
      notificacion: { createMany: jest.fn() },
    };

    await service.registrarAgotamiento(
      tx as unknown as Prisma.TransactionClient,
      {
        id: 4,
        nombre: 'Teclado',
        codigo: 'TEC-1',
      },
    );

    expect(tx.notificacion.createMany).toHaveBeenCalledWith({
      data: [
        {
          id_usuario: 2,
          id_producto: 4,
          tipo: 'STOCK_AGOTADO',
          mensaje: 'El producto Teclado (TEC-1) se agotó y fue deshabilitado.',
        },
        {
          id_usuario: 3,
          id_producto: 4,
          tipo: 'STOCK_AGOTADO',
          mensaje: 'El producto Teclado (TEC-1) se agotó y fue deshabilitado.',
        },
      ],
    });
  });

  it('persists pending and resolved request notifications', async () => {
    const tx = {
      usuario: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 2, nombre: 'Admin', email: 'admin@example.com' },
          ]),
      },
      notificacion: {
        createMany: jest.fn(),
        create: jest.fn(),
      },
    };
    const solicitud = {
      id: 15,
      id_usuario: 8,
      id_producto: 4,
      cantidad: 2,
      estado_solicitud: 'APROBADA' as const,
      usuario: { nombre: 'Erik' },
      producto: { nombre: 'Teclado' },
    };

    const transaction = tx as unknown as Prisma.TransactionClient;
    await service.registrarSolicitudPendiente(transaction, solicitud);
    await service.registrarResultadoSolicitud(transaction, solicitud);

    expect(tx.notificacion.createMany).toHaveBeenCalledWith({
      data: [
        {
          id_usuario: 2,
          id_solicitud: 15,
          id_producto: 4,
          tipo: 'PENDIENTE',
          mensaje: 'Erik solicitó 2 Teclado',
        },
      ],
    });
    expect(tx.notificacion.create).toHaveBeenCalledWith({
      data: {
        id_usuario: 8,
        id_solicitud: 15,
        id_producto: 4,
        tipo: 'APROBADA',
        mensaje: 'Tu solicitud de 2 Teclado fue aprobada',
      },
    });
  });

  it('returns already-read notifications idempotently', async () => {
    prisma.notificacion.updateMany.mockResolvedValue({ count: 0 });
    prisma.notificacion.findFirst.mockResolvedValue({ id: 18, leida: true });

    await expect(service.marcarComoLeida(18, 7)).resolves.toEqual({
      id: 18,
      leida: true,
    });
  });

  it('does not disclose notifications belonging to another user', async () => {
    prisma.notificacion.updateMany.mockResolvedValue({ count: 0 });
    prisma.notificacion.findFirst.mockResolvedValue(null);

    await expect(service.marcarComoLeida(18, 7)).rejects.toThrow(
      'Notificación no encontrada',
    );
    expect(prisma.notificacion.findFirst).toHaveBeenCalledWith({
      where: { id: 18, id_usuario: 7 },
      select: { id: true, leida: true },
    });
  });
});
