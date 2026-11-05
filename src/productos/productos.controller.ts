import { Controller, Get, Post, Put, Patch, Delete, Param, Body, UseInterceptors, UploadedFile, BadRequestException, ForbiddenException, NotFoundException, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProductosService } from './productos.service';
import { CloudinaryService } from 'src/cloudinary.service';

interface CloudinaryResponse {
  secure_url: string;
  public_id: string;
  [key: string]: any;
}

@Controller('productos')
export class ProductosController {
  constructor(
    private readonly productosService: ProductosService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async create(@Request() req: any, @Body() body: any) {
    const userId = req.user?.id;

    return this.productosService.create(
      userId,
      body.codigo,
      body.nombre,
      body.descripcion,
      body.id_categoria,
      body.cantidad,
      body.foto_producto,
    );
  }

  @Get()
  async findAll() {
    return this.productosService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.productosService.findOne(+id);
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'))
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const userId = req.user?.id ?? body?.id_usuario;

    if (!userId) {
      throw new BadRequestException('No se pudo identificar al usuario autenticado');
    }
    if (body.estado !== undefined && req.user?.rol !== 'ADMIN') {
      throw new ForbiddenException('Solo un administrador puede cambiar el estado de un producto');
    }

    const datosProducto = {
      id_usuario: userId,
      codigo: body.codigo,
      nombre: body.nombre,
      descripcion: body.descripcion,
      id_category: body.id_category,
      cantidad: body.cantidad,
      estado: body.estado,
      foto_producto: body.foto_producto,
    };

    return this.productosService.update(+id, userId, datosProducto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.productosService.remove(+id);
  }

  @Patch(':id/activar')
  @UseGuards(AuthGuard('jwt'))
  async activar(@Request() req: any, @Param('id') id: string) {
    if (req.user?.rol !== 'ADMIN') {
      throw new ForbiddenException('Solo un administrador puede activar productos');
    }

    return this.productosService.activar(+id);
  }

  @Post(':id/imagen')
  @UseInterceptors(FileInterceptor('imagen'))
  async subirImagenProducto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ninguna imagen');
    }

    try {
      const result = await this.cloudinaryService.uploadImage(file, 'productos') as CloudinaryResponse;
      
      if (!result?.secure_url) {
        throw new Error('No se pudo obtener la URL de la imagen subida');
      }

      const productoActualizado = await this.productosService.update(+id, 1, {
        foto_producto: result.secure_url
      });

      return {
        mensaje: 'Imagen del producto actualizada correctamente',
        foto_producto: (productoActualizado as any)?.foto_producto,
      };
    } catch (error: unknown) {
      console.error('Error al subir la imagen:', error);
      const message = error instanceof Error ? error.message : 'Error desconocido';
      throw new BadRequestException(`Error al subir la imagen: ${message}`);
    }
  }

  @Get(':id/imagen')
  async obtenerImagenProducto(@Param('id') id: string) {
    const producto = await this.productosService.findOne(+id);
    
    if (!producto || !('foto_producto' in producto)) {
      throw new NotFoundException('El producto no tiene una imagen asociada');
    }
    
    return { 
      success: true,
      foto_producto: (producto as any).foto_producto 
    };
  }

  @Delete(':id/imagen')
  async eliminarImagenProducto(@Param('id') id: string) {
    const producto = await this.productosService.findOne(+id);
    
    if (!producto || !('foto_producto' in producto) || !(producto as any).foto_producto) {
      throw new NotFoundException('El producto no tiene una imagen asociada');
    }

    const fotoUrl = (producto as any).foto_producto;

    // Extraer public ID de la URL
    try {
      const publicId = this.extractPublicIdFromUrl(fotoUrl);
      if (publicId) {
        await (this.cloudinaryService as any).uploader.destroy(publicId);
      }
    } catch (error) {
      console.error('Error al eliminar la imagen de Cloudinary:', error);
      // Continuar incluso si falla la eliminación en Cloudinary
    }

    // Actualizar el producto para eliminar la URL de la imagen
    await this.productosService.update(+id, 1, { foto_producto: null });

    return { 
      success: true,
      mensaje: 'Imagen del producto eliminada correctamente' 
    };
  }

  @Get('categoria/:idCategoria')
  async findByCategoria(@Param('idCategoria') idCategoria: string) {
    return this.productosService.findByCategoria(+idCategoria);
  }

  @Get('dashboard/estadisticas')
  async getEstadisticas() {
    return this.productosService.getDashboardStats();
  }

  @Get('dashboard/productos-bajo-stock')
  async getProductosBajoStock() {
    return this.productosService.getProductosBajoStock();
  }

  @Get('dashboard/movimientos-recientes')
  async getMovimientosRecientes(@Query('limit') limit = 10) {
    return this.productosService.getMovimientosRecientes(Number(limit));
  }

  @Get('dashboard/solicitudes-pendientes')
  async getSolicitudesPendientes() {
    return this.productosService.getSolicitudesPendientes();
  }

  private extractPublicIdFromUrl(url: string): string | null {
    try {
      const urlParts = url.split('/');
      const filename = urlParts[urlParts.length - 1];
      return filename.split('.')[0];
    } catch (error) {
      console.error('Error al extraer el public ID de la URL:', error);
      return null;
    }
  }
}