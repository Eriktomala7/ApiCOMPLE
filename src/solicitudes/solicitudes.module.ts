import { Module } from '@nestjs/common';
import { SolicitudesService } from './solicitudes.service';
import { SolicitudesController } from './solicitudes.controller';
import { UsuariosModule } from 'src/usuarios/usuarios.module';
import { NotificacionesModule } from 'src/notificaciones/notificaciones.module';

@Module({
  imports: [UsuariosModule, NotificacionesModule],
  providers: [SolicitudesService],
  controllers: [SolicitudesController]
})
export class SolicitudesModule {}
