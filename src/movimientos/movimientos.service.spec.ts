import { Test, TestingModule } from '@nestjs/testing';
import { TipoMovimiento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MovimientosService } from './movimientos.service';
import { NotificacionesService } from 'src/notificaciones/notificaciones.service';

describe('MovimientosService', () => {
  let service: MovimientosService;
  const mockPrisma = {
    $transaction: jest.fn(),
    producto: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    movimiento: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const notificacionesService = {
    registrarAgotamiento: jest.fn(),
    enviarAvisosDeAgotamiento: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MovimientosService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificacionesService, useValue: notificacionesService },
      ],
    }).compile();

    service = module.get<MovimientosService>(MovimientosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should set stock to the counted quantity for AJUSTE and record the count', async () => {
    const producto = { id: 4, cantidad: 10 };
    const tx = {
      producto: {
        findUnique: jest.fn().mockResolvedValue(producto),
        update: jest.fn().mockResolvedValue({ ...producto, cantidad: 5 }),
      },
      movimiento: {
        create: jest.fn().mockResolvedValue({
          id: 99,
          id_producto: 4,
          id_usuario: 2,
          tipo: TipoMovimiento.AJUSTE,
          cantidad: 5,
          motivo: 'Ajuste de inventario',
        }),
      },
    };

    mockPrisma.$transaction.mockImplementation(async (callback) => {
      return callback(tx);
    });

    const result = await service.create(4, 2, TipoMovimiento.AJUSTE, 5, 'Ajuste de inventario');

    expect(result).toBeDefined();
    expect(tx.producto.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { cantidad: 5 },
    });
    expect(tx.movimiento.create).toHaveBeenCalledWith({
      data: {
        id_producto: 4,
        id_usuario: 2,
        tipo: TipoMovimiento.AJUSTE,
        cantidad: 5,
        motivo: 'Ajuste de inventario',
      },
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('should reject a negative counted quantity for AJUSTE', async () => {
    await expect(
      service.create(4, 2, TipoMovimiento.AJUSTE, -5, 'Ajuste de inventario'),
    ).rejects.toThrow('La cantidad del ajuste debe ser igual o mayor a 0');

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('deactivates and notifies when a SALIDA exhausts the product', async () => {
    const producto = { id: 4, nombre: 'Teclado', codigo: 'TEC-1', cantidad: 2 };
    const admins = [{ id: 1, nombre: 'Admin', email: 'admin@example.com' }];
    const tx = {
      producto: {
        findUnique: jest.fn().mockResolvedValue(producto),
        update: jest.fn().mockResolvedValue({ ...producto, cantidad: 0, estado: 'INACTIVO' }),
      },
      movimiento: { create: jest.fn().mockResolvedValue({ id: 99 }) },
    };
    notificacionesService.registrarAgotamiento.mockResolvedValue(admins);
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.create(4, 2, TipoMovimiento.SALIDA, 2);

    expect(tx.producto.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { cantidad: 0, estado: 'INACTIVO' },
    });
    expect(notificacionesService.registrarAgotamiento).toHaveBeenCalledWith(tx, {
      id: 4,
      nombre: 'Teclado',
      codigo: 'TEC-1',
    });
    expect(notificacionesService.enviarAvisosDeAgotamiento).toHaveBeenCalledWith(
      { id: 4, nombre: 'Teclado', codigo: 'TEC-1' },
      admins,
    );
  });

  it('should update product stock when an ENTRADA movement quantity changes', async () => {
    const tx = {
      movimiento: {
        findUnique: jest.fn().mockResolvedValue({
          id: 99,
          id_producto: 4,
          tipo: TipoMovimiento.ENTRADA,
          cantidad: 24,
          producto: { cantidad: 30 },
        }),
        update: jest.fn().mockResolvedValue({
          id: 99,
          tipo: TipoMovimiento.AJUSTE,
          cantidad: 26,
        }),
      },
      producto: {
        update: jest.fn().mockResolvedValue({ id: 4, cantidad: 26 }),
      },
    };
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.update(99, { cantidad: 26 });

    expect(tx.producto.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { cantidad: 26 },
    });
    expect(tx.movimiento.update).toHaveBeenCalledWith({
      where: { id: 99 },
      data: { cantidad: 26, tipo: TipoMovimiento.AJUSTE },
    });
  });

  it('should keep the movement type when only its reason changes', async () => {
    const tx = {
      movimiento: {
        findUnique: jest.fn().mockResolvedValue({
          id: 99,
          id_producto: 4,
          tipo: TipoMovimiento.ENTRADA,
          cantidad: 24,
          producto: { cantidad: 30 },
        }),
        update: jest.fn().mockResolvedValue({ id: 99, motivo: 'Corrección' }),
      },
      producto: {
        update: jest.fn(),
      },
    };
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.update(99, { motivo: 'Corrección' });

    expect(tx.producto.update).not.toHaveBeenCalled();
    expect(tx.movimiento.update).toHaveBeenCalledWith({
      where: { id: 99 },
      data: { motivo: 'Corrección' },
    });
  });
});
