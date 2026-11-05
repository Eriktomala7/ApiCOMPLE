import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { Estado, Rol, Usuario } from 'generated/prisma';
import { randomUUID } from 'crypto';
import { EmailService } from './email.service';

type UpdateUsuarioData = {
  nombre?: string;
  email?: string;
  password?: string;
  rol?: Rol;
  estado?: Estado;
  foto_perfil?: string | null;
};

@Injectable()
export class UsuariosService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  // Crear usuario (admin)
  async create(data: {
    nombre: string;
    email: string;
    password: string;
    rol: Rol;
    estado?: Estado;
  }): Promise<Omit<Usuario, 'password'>> {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.usuario.create({
      data: { ...data, password: hashedPassword },
    });
    const { password, ...result } = user;
    return result;
  }

  // Listar todos los usuarios
  async findAll(): Promise<Omit<Usuario, 'password'>[]> {
    const users = await this.prisma.usuario.findMany();
    return users.map(({ password, ...rest }) => rest);
  }

  // Obtener usuario por ID
  async findOne(id: number): Promise<Omit<Usuario, 'password'>> {
    const user = await this.prisma.usuario.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const { password, ...result } = user;
    return result;
  }

  // Actualizar usuario
  async update(
    id: number,
    data: UpdateUsuarioData
  ): Promise<Omit<Usuario, 'password'>> {
    // Si se está actualizando la contraseña, hashearla
    if (data.password) {
      const salt = await bcrypt.genSalt();
      data.password = await bcrypt.hash(data.password, salt);
    }

    try {
      const user = await this.prisma.usuario.update({
        where: { id },
        data,
      });
      
      // Eliminamos la contraseña del objeto de retorno
      const { password, ...result } = user;
      return result;
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
      }
      throw new InternalServerErrorException('Error al actualizar el usuario');
    }
  }

  // Eliminar usuario (soft delete)
  async remove(id: number): Promise<Omit<Usuario, 'password'>> {
    const user = await this.prisma.usuario.update({
      where: { id },
      data: { estado: Estado.INACTIVO },
    });
    const { password, ...result } = user;
    return result;
  }

  // Generar token de recuperación y enviarlo por correo
  async generarTokenRecuperacion(email: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    const token = randomUUID();
    const expiracion = new Date();
    expiracion.setMinutes(expiracion.getMinutes() + 30); // Expira en 30 min

    await this.prisma.usuario.update({
      where: { email },
      data: { reset_token: token, reset_token_expiration: expiracion },
    });

    try {
      await this.emailService.enviarTokenRecuperacion(email, token);
    } catch (error) {
      throw new InternalServerErrorException('No se pudo enviar el correo de recuperación');
    }

    return { message: 'Token enviado por correo' };
  }

  // Resetear contraseña usando token
  async resetPassword(token: string, nuevaPassword: string) {
    const usuario = await this.prisma.usuario.findFirst({
      where: {
        reset_token: token,
        reset_token_expiration: { gte: new Date() },
      },
    });

    if (!usuario) throw new NotFoundException('Token inválido o expirado');

    const hashedPassword = await bcrypt.hash(nuevaPassword, 10);

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        password: hashedPassword,
        reset_token: null,
        reset_token_expiration: null,
      },
    });

    return { message: 'Contraseña actualizada correctamente' };
  }
}
