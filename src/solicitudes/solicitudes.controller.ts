import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SolicitudesService } from './solicitudes.service';
import { EstadoSolicitud } from '@prisma/client';

declare global {
  namespace Express {
    interface User {
      id: number;
      email: string;
      rol: string;
    }
  }
}

@Controller('solicitudes')
export class SolicitudesController {
  constructor(private readonly solicitudesService: SolicitudesService) {}

  @Post()
  async create(@Body() body: any) {
    return this.solicitudesService.create(
      body.id_usuario,
      body.id_producto,
      body.cantidad,
      body.comentario,
    );
  }

  @Get()
  async findAll() {
    return this.solicitudesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.solicitudesService.findOne(+id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      cantidad?: number;
      comentario?: string;
      estado?: 'ACTIVO' | 'INACTIVO';
    },
  ) {
    return this.solicitudesService.update(
      +id,
      body.cantidad,
      body.comentario,
      body.estado,
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.solicitudesService.remove(+id);
  }

  @Patch(':id/estado')
  async updateEstados(
    @Param('id') id: string,
    @Body('estado_solicitud') estado_solicitud: EstadoSolicitud,
  ) {
    return this.solicitudesService.updateEstado(Number(id), estado_solicitud);
  }

  @Get('mis-solicitudes')
  async findMisSolicitudes(@Req() req: { user: { id: number } }) {
    // Asegurarse de que solo se devuelvan las solicitudes del usuario autenticado
    const userId = req.user.id;
    return this.solicitudesService.findByUsuario(userId);
  }

  @Get('usuario/:idUsuario')
  async findSolicitudesByUsuario(@Param('idUsuario') idUsuario: string) {
    return this.solicitudesService.findByUsuario(Number(idUsuario));
  }

  @Get('admin/notificaciones')
  @UseGuards(AuthGuard('jwt'))
  async findNotificacionesAdmin(
    @Req() req: { user: { id: number; rol: string } },
  ) {
    if (req.user.rol !== 'ADMIN') {
      throw new ForbiddenException(
        'Solo un administrador puede consultar estas notificaciones',
      );
    }
    return this.solicitudesService.findNotificacionesAdmin(req.user.id);
  }

  @Get('usuario/:idUsuario/notificaciones')
  @UseGuards(AuthGuard('jwt'))
  async findNotificaciones(
    @Param('idUsuario') idUsuario: string,
    @Req() req: { user: { id: number } },
  ) {
    const userId = Number(idUsuario);
    if (req.user.id !== userId) {
      throw new ForbiddenException(
        'Solo puedes consultar tus propias notificaciones',
      );
    }
    return this.solicitudesService.findNotificaciones(userId);
  }

  @Get('debug/todas')
  async debugTodasLasSolicitudes() {
    return this.solicitudesService.findAll();
  }

  @Get('debug/usuario/:id')
  async debugSolicitudesUsuario(@Param('id') id: string) {
    const solicitudes = await this.solicitudesService.findByUsuario(Number(id));
    return {
      count: solicitudes.length,
      data: solicitudes,
    };
  }
}
