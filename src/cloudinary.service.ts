// cloudinary.service.ts
import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { config } from 'dotenv';

config(); // carga las variables del .env

@Injectable()
export class CloudinaryService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dvgmi6uzg',
      api_key: process.env.CLOUDINARY_API_KEY || '336867385382289',
      api_secret: process.env.CLOUDINARY_API_SECRET || '40gPuqTzaKe-c8wdajz-YzdoHjM',
    });
  }

  async uploadImage(file: Express.Multer.File, folder = 'default') {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      ).end(file.buffer);
    });
  }
}
