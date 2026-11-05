import { Module } from '@nestjs/common';
import { ProductosService } from './productos.service';
import { ProductosController } from './productos.controller';
import { CloudinaryService } from 'src/cloudinary.service';
import { MovimientosModule } from 'src/movimientos/movimientos.module';
import { NotificacionesModule } from 'src/notificaciones/notificaciones.module';

@Module({
  providers: [ProductosService,CloudinaryService],
  controllers: [ProductosController],
  imports: [MovimientosModule, NotificacionesModule]
})
export class ProductosModule {}
