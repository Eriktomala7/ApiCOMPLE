import { Module } from '@nestjs/common';
import { MovimientosService } from './movimientos.service';
import { MovimientosController } from './movimientos.controller';
import { NotificacionesModule } from 'src/notificaciones/notificaciones.module';

@Module({
  providers: [MovimientosService],
  controllers: [MovimientosController],
  imports: [NotificacionesModule],
  exports: [MovimientosService]
})
export class MovimientosModule {}
