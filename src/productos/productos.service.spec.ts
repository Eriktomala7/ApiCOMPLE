import { Test, TestingModule } from '@nestjs/testing';
import { ProductosService } from './productos.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificacionesService } from 'src/notificaciones/notificaciones.service';

describe('ProductosService', () => {
  let service: ProductosService;

  beforeEach(async () => {
    process.env.GEMINI_API_KEY = 'test-api-key';
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductosService,
        { provide: PrismaService, useValue: {} },
        { provide: NotificacionesService, useValue: {} },
      ],
    }).compile();

    service = module.get<ProductosService>(ProductosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
