// usuarios.controller.ts
import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Param, 
  Body, 
  ParseIntPipe, 
  UseInterceptors, 
  UploadedFile, 
  BadRequestException,
  NotFoundException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsuariosService } from './usuarios.service';
import { Estado, Rol } from 'generated/prisma';
import { CloudinaryService } from 'src/cloudinary.service';

// Add this type for Cloudinary response
interface CloudinaryResponse {
  secure_url: string;
  public_id: string;
  [key: string]: any;
}
@Controller('usuarios')
export class UsuariosController {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Post()
  create(
    @Body('nombre') nombre: string,
    @Body('email') email: string,
    @Body('password') password: string,
    @Body('rol') rol: Rol,
    @Body('estado') estado?: Estado,
  ) {
    return this.usuariosService.create({ nombre, email, password, rol, estado });
  }

  @Get()
  findAll() {
    return this.usuariosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usuariosService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<{ nombre: string; email: string; password: string; rol: Rol; estado: Estado }>,
  ) {
    return this.usuariosService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.usuariosService.remove(id);
  }
  // Generar token de recuperación (enviar luego por correo)
  @Post('recuperar')
  async generarToken(@Body('email') email: string) {
    const result = await this.usuariosService.generarTokenRecuperacion(email);
    return result; // Returns { message: 'Token enviado por correo' }
  }

  // Resetear contraseña usando token
  @Post('reset')
  async resetPassword(
    @Body() body: { token: string; nuevaPassword: string }
  ) {
   
    return this.usuariosService.resetPassword(body.token, body.nuevaPassword);
  }

  @Post(':id/foto-perfil')
@UseInterceptors(FileInterceptor('foto'))
async subirFotoPerfil(
  @Param('id', ParseIntPipe) id: number,
  @UploadedFile() file: Express.Multer.File,
) {
  if (!file) {
    throw new BadRequestException('No se proporcionó ninguna imagen');
  }

  try {
    // Cast the Cloudinary response to our interface
    const result = await this.cloudinaryService.uploadImage(file, 'perfiles') as CloudinaryResponse;
    
    // Use update instead of actualizar
    const usuarioActualizado = await this.usuariosService.update(id, {
      foto_perfil: result.secure_url
    });

    return {
      mensaje: 'Foto de perfil actualizada correctamente',
      // Use type assertion for the response
      foto_perfil: (usuarioActualizado as any).foto_perfil,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    throw new BadRequestException(`Error al subir la foto: ${message}`);
  }
}
@Get(':id/foto-perfil')
async obtenerFotoPerfil(@Param('id', ParseIntPipe) id: number) {
  const usuario = await this.usuariosService.findOne(id) as any;
  
  if (!usuario.foto_perfil) {
    throw new NotFoundException('El usuario no tiene una foto de perfil');
  }
  
  return { foto_perfil: usuario.foto_perfil };
}
@Delete(':id/foto-perfil')
async eliminarFotoPerfil(@Param('id', ParseIntPipe) id: number) {
  const usuario = await this.usuariosService.findOne(id) as any;
  
  if (!usuario.foto_perfil) {
    throw new NotFoundException('El usuario no tiene una foto de perfil');
  }

  // Extract public ID from URL (basic implementation)
  try {
    const urlParts = usuario.foto_perfil.split('/');
    const publicId = urlParts[urlParts.length - 1].split('.')[0];
    if (publicId) {
      await (this.cloudinaryService as any).uploader.destroy(publicId);
    }
  } catch (error) {
    console.error('Error al eliminar la imagen de Cloudinary:', error);
    // Continue even if Cloudinary deletion fails
  }

  // Update user to remove photo URL
  await this.usuariosService.update(id, { foto_perfil: null });

  return { mensaje: 'Foto de perfil eliminada correctamente' };
}
}