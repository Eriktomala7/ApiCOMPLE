import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificacionesService } from './notificaciones.service';

@Controller('notificaciones')
@UseGuards(AuthGuard('jwt'))
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Get()
  listar(@Req() request: { user: { id: number; rol: string } }) {
    this.validarAdministrador(request.user.rol);
    return this.notificacionesService.listarParaAdministrador(request.user.id);
  }

  @Patch(':id/leida')
  marcarComoLeida(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: { user: { id: number } },
  ) {
    return this.notificacionesService.marcarComoLeida(id, request.user.id);
  }

  private validarAdministrador(rol: string) {
    if (rol !== 'ADMIN') {
      throw new ForbiddenException(
        'Solo un administrador puede consultar estas notificaciones',
      );
    }
  }
}
