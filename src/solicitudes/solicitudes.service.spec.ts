import { Test, TestingModule } from '@nestjs/testing';
import { SolicitudesService } from './solicitudes.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmailService } from 'src/usuarios/email.service';
import { NotificacionesService } from 'src/notificaciones/notificaciones.service';

describe('SolicitudesService', () => {
  let service: SolicitudesService;
  let tx: {
    producto: { findUnique: jest.Mock };
    solicitud: { create: jest.Mock };
  };
  let prisma: {
    $transaction: jest.Mock;
    producto: { findUnique: jest.Mock };
    solicitud: { create: jest.Mock };
  };
  let emailService: { enviarNotificacionSolicitud: jest.Mock };
  const notificacionesService = {
    registrarAgotamiento: jest.fn(),
    enviarAvisosDeAgotamiento: jest.fn(),
    registrarSolicitudPendiente: jest.fn(),
    registrarResultadoSolicitud: jest.fn(),
    listarSolicitudesParaUsuario: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tx = {
      producto: { findUnique: jest.fn() },
      solicitud: { create: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
      producto: { findUnique: jest.fn() },
      solicitud: { create: jest.fn() },
    };
    emailService = { enviarNotificacionSolicitud: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SolicitudesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
        { provide: NotificacionesService, useValue: notificacionesService },
      ],
    }).compile();

    service = module.get<SolicitudesService>(SolicitudesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('notifies active administrators when a request is created', async () => {
    const solicitud = {
      id: 12,
      id_usuario: 7,
      id_producto: 4,
      usuario: { nombre: 'Usuario', email: 'usuario@example.com' },
      producto: { nombre: 'Teclado' },
      cantidad: 2,
      comentario: 'Para el equipo',
      fecha: new Date(),
    };
    const administradores = [
      { id: 1, nombre: 'Admin', email: 'admin@example.com' },
    ];
    tx.producto.findUnique.mockResolvedValue({ id: 4 });
    tx.solicitud.create.mockResolvedValue(solicitud);
    notificacionesService.registrarSolicitudPendiente.mockResolvedValue(
      administradores,
    );

    await expect(service.create(7, 4, 2, 'Para el equipo')).resolves.toBe(
      solicitud,
    );

    expect(
      notificacionesService.registrarSolicitudPendiente,
    ).toHaveBeenCalledWith(tx, solicitud);
    expect(emailService.enviarNotificacionSolicitud).toHaveBeenCalledWith(
      administradores[0],
      solicitud,
    );
  });

  it('returns the created request even if an administrator notification fails', async () => {
    const solicitud = {
      id: 13,
      id_usuario: 7,
      id_producto: 4,
      usuario: { nombre: 'Usuario', email: 'usuario@example.com' },
      producto: { nombre: 'Teclado' },
      cantidad: 1,
      comentario: null,
      fecha: new Date(),
    };
    tx.producto.findUnique.mockResolvedValue({ id: 4 });
    tx.solicitud.create.mockResolvedValue(solicitud);
    notificacionesService.registrarSolicitudPendiente.mockResolvedValue([
      { id: 1, nombre: 'Admin', email: 'bad-email' },
    ]);
    emailService.enviarNotificacionSolicitud.mockRejectedValue(
      new Error('El administrador tiene un correo inválido configurado'),
    );
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await expect(service.create(7, 4, 1)).resolves.toBe(solicitud);

    expect(tx.solicitud.create).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('La solicitud #13 se creó'),
    );
    errorSpy.mockRestore();
  });
});
