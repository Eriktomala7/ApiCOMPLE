import { Module } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { UsuariosController } from './usuarios.controller';
import { EmailService } from './email.service';
import { CloudinaryService } from 'src/cloudinary.service';

@Module({
  providers: [UsuariosService,EmailService,CloudinaryService],
  controllers: [UsuariosController],
  exports: [EmailService],
})
export class UsuariosModule {}
