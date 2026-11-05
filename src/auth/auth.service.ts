import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // Validar usuario por email y contraseña
  async validateUser(email: string, password: string) {
    const user = await this.prisma.usuario.findUnique({
      where: { email },
    });

    if (user && await bcrypt.compare(password, user.password)) {
      const { password, ...result } = user;
      return result;
    }

    return null;
  }

  // Login: devuelve JWT
  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    if (!user) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    const payload = { sub: user.id, email: user.email, rol: user.rol };
    return {
      access_token: this.jwtService.sign(payload),
      rol: user.rol,
      email: user.email,
      id: user.id
    };
  }

  // Registro de usuario
  async register(nombre: string, email: string, password: string, rol: string) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.prisma.usuario.create({
      data: {
        nombre,
        email,
        password: hashedPassword,
        rol: rol as 'ADMIN' | 'USUARIO',
      },
    });
    const { password: pwd, ...result } = user;
    return result;
  }
}
