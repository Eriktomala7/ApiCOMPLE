import { Injectable, InternalServerErrorException } from '@nestjs/common';
import SibApiV3Sdk from 'sib-api-v3-sdk';

@Injectable()
export class EmailService {
  private apiInstance: SibApiV3Sdk.TransactionalEmailsApi;

  constructor() {
    const apiKey = process.env.BREVO_API_KEY?.trim();

    this.apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

    if (apiKey) {
      const defaultClient = SibApiV3Sdk.ApiClient.instance;
      const brevoAuth = defaultClient.authentications['api-key'];
      if (brevoAuth) {
        brevoAuth.apiKey = apiKey;
      }
      console.log('✅ API Key de Brevo configurada correctamente');
    } else {
      console.warn('⚠️ BREVO_API_KEY no está configurada. Los emails no se enviarán.');
    }
  }

  async enviarTokenRecuperacion(to: string, token: string) {
    const apiKey = process.env.BREVO_API_KEY?.trim();
    if (!apiKey) {
      throw new InternalServerErrorException('BREVO_API_KEY no está configurada');
    }

    const sender = {
  email: process.env.BREVO_FROM_EMAIL ?? 'eriktomala7@gmail.com',
  name: process.env.BREVO_FROM_NAME ?? 'Stockwise',
};

    const toEmail = [{
      email: to,
      name: to.split('@')[0],
    }];

    console.log('📨 Enviando email de recuperación:');
    console.log('De:', sender.email);
    console.log('Para:', to);
    console.log('Token:', token);

    try {
      const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
      sendSmtpEmail.subject = 'Restablece tu contraseña de StockMate';
      sendSmtpEmail.htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #2c3e50; text-align: center;">Restablecer Contraseña</h2>
          <p>Hola,</p>
          <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <button style="
              background-color: #4CAF50;
              color: white;
              padding: 12px 24px;
              border: none;
              border-radius: 4px;
              font-size: 16px;
              cursor: not-allowed;
              opacity: 0.7;
            ">
              Restablecer Contraseña
            </button>
          </div>
          
          <p>O usa este token en la aplicación:</p>
          <div style="
            background-color: #f5f5f5;
            padding: 10px;
            border-radius: 4px;
            text-align: center;
            font-family: monospace;
            font-size: 14px;
            word-break: break-all;
            margin: 15px 0;
          ">
            ${token}
          </div>
          
          <p style="font-size: 12px; color: #7f8c8d; border-top: 1px solid #eee; padding-top: 15px; margin-top: 20px;">
            Si no solicitaste este cambio, puedes ignorar este mensaje. Este enlace expirará en 30 minutos.
          </p>
        </div>
      `;
      sendSmtpEmail.sender = sender;
      sendSmtpEmail.to = toEmail;

      const response = await this.apiInstance.sendTransacEmail(sendSmtpEmail);
      console.log('✅ Email enviado correctamente');
      return response;
    } catch (error: unknown) {
      const err = error as { response?: { body?: unknown }; message?: string };
      console.error('❌ Error al enviar email:', err.response?.body ?? err.message ?? error);
      throw new InternalServerErrorException('No se pudo enviar el correo de recuperación');
    }
  }

  async enviarResultadoSolicitud(
    destinatario: { email: string; nombre: string },
    solicitud: {
      id: number;
      producto: { nombre: string };
      cantidad: number;
      estado_solicitud: string;
    },
  ) {
    const apiKey = process.env.BREVO_API_KEY?.trim();
    if (!apiKey) {
      throw new InternalServerErrorException('BREVO_API_KEY no está configurada');
    }

    const email = destinatario.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new InternalServerErrorException(`Correo inválido para ${destinatario.nombre}`);
    }

    const aprobada = solicitud.estado_solicitud === 'APROBADA';
    const escapeHtml = (value: string) =>
      value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = `Tu solicitud #${solicitud.id} fue ${aprobada ? 'aprobada' : 'rechazada'}`;
    sendSmtpEmail.htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: ${aprobada ? '#16a34a' : '#dc2626'};">Solicitud ${aprobada ? 'aprobada' : 'rechazada'}</h2>
        <p>Hola ${escapeHtml(destinatario.nombre)}, tu solicitud de <strong>${solicitud.cantidad}</strong> unidad(es) de <strong>${escapeHtml(solicitud.producto.nombre)}</strong> fue ${aprobada ? 'aprobada' : 'rechazada'}.</p>
      </div>
    `;
    sendSmtpEmail.sender = {
      email: process.env.BREVO_FROM_EMAIL ?? 'eriktomala7@gmail.com',
      name: process.env.BREVO_FROM_NAME ?? 'Stockwise',
    };
    sendSmtpEmail.to = [{ email, name: destinatario.nombre }];

    try {
      return await this.apiInstance.sendTransacEmail(sendSmtpEmail);
    } catch (error: unknown) {
      const err = error as { response?: { body?: unknown }; message?: string };
      console.error('Error al enviar resultado de solicitud:', err.response?.body ?? err.message ?? error);
      throw new InternalServerErrorException(`No se pudo notificar el resultado de la solicitud #${solicitud.id}`);
    }
  }

  async enviarNotificacionSolicitud(
    destinatario: { email: string; nombre: string },
    solicitud: {
      id: number;
      usuario: { nombre: string; email: string };
      producto: { nombre: string };
      cantidad: number;
      comentario: string | null;
      fecha: Date;
    },
  ) {
    const apiKey = process.env.BREVO_API_KEY?.trim();
    if (!apiKey) {
      throw new InternalServerErrorException('BREVO_API_KEY no está configurada');
    }

    const destinatarioEmail = destinatario.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatarioEmail)) {
      throw new InternalServerErrorException(
        `El administrador ${destinatario.nombre} tiene un correo inválido configurado`,
      );
    }

    const escapeHtml = (value: string) =>
      value.replace(/[&<>"']/g, (character) => {
        const entities: Record<string, string> = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        };
        return entities[character];
      });

    const sender = {
      email: process.env.BREVO_FROM_EMAIL ?? 'eriktomala7@gmail.com',
      name: process.env.BREVO_FROM_NAME ?? 'Stockwise',
    };
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = `Nueva solicitud de inventario #${solicitud.id}`;
    sendSmtpEmail.htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>Nueva solicitud de inventario</h2>
        <p>Se ha registrado una solicitud pendiente de revisión.</p>
        <ul>
          <li><strong>Solicitud:</strong> #${solicitud.id}</li>
          <li><strong>Usuario:</strong> ${escapeHtml(solicitud.usuario.nombre)} (${escapeHtml(solicitud.usuario.email)})</li>
          <li><strong>Producto:</strong> ${escapeHtml(solicitud.producto.nombre)}</li>
          <li><strong>Cantidad:</strong> ${solicitud.cantidad}</li>
          <li><strong>Comentario:</strong> ${escapeHtml(solicitud.comentario ?? 'Sin comentario')}</li>
          <li><strong>Fecha:</strong> ${escapeHtml(solicitud.fecha.toLocaleString('es-MX'))}</li>
        </ul>
      </div>
    `;
    sendSmtpEmail.sender = sender;
    sendSmtpEmail.to = [{ email: destinatarioEmail, name: destinatario.nombre }];

    try {
      return await this.apiInstance.sendTransacEmail(sendSmtpEmail);
    } catch (error: unknown) {
      const err = error as { response?: { body?: unknown }; message?: string };
      console.error('Error al enviar la notificación de solicitud:', err.response?.body ?? err.message ?? error);
      throw new InternalServerErrorException(
        `No se pudo enviar la notificación de la solicitud #${solicitud.id}`,
      );
    }
  }

  async enviarNotificacionStockAgotado(
    destinatario: { email: string; nombre: string },
    producto: { id: number; nombre: string; codigo: string },
  ) {
    const apiKey = process.env.BREVO_API_KEY?.trim();
    if (!apiKey) {
      throw new InternalServerErrorException('BREVO_API_KEY no está configurada');
    }

    const email = destinatario.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new InternalServerErrorException(
        `El administrador ${destinatario.nombre} tiene un correo inválido configurado`,
      );
    }

    const escapeHtml = (value: string) =>
      value.replace(/[&<>"']/g, (character) => {
        const entities: Record<string, string> = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        };
        return entities[character];
      });

    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = `Producto agotado: ${producto.nombre}`;
    sendSmtpEmail.htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>Producto agotado</h2>
        <p>Hola ${escapeHtml(destinatario.nombre)}, el inventario de este producto llegó a cero y el producto fue deshabilitado automáticamente:</p>
        <ul>
          <li><strong>Producto:</strong> ${escapeHtml(producto.nombre)}</li>
          <li><strong>Código:</strong> ${escapeHtml(producto.codigo)}</li>
        </ul>
      </div>
    `;
    sendSmtpEmail.sender = {
      email: process.env.BREVO_FROM_EMAIL ?? 'eriktomala7@gmail.com',
      name: process.env.BREVO_FROM_NAME ?? 'Stockwise',
    };
    sendSmtpEmail.to = [{ email, name: destinatario.nombre }];

    try {
      return await this.apiInstance.sendTransacEmail(sendSmtpEmail);
    } catch (error: unknown) {
      const err = error as { response?: { body?: unknown }; message?: string };
      console.error('Error al enviar aviso de producto agotado:', err.response?.body ?? err.message ?? error);
      throw new InternalServerErrorException(
        `No se pudo notificar el agotamiento del producto ${producto.codigo}`,
      );
    }
  }
}
