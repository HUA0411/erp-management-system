import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { BusinessException } from '../common/exceptions/business.exception';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

@ApiTags('文件上传')
@Controller('upload')
export class UploadController {
  @Post('image')
  @RequirePermissions('product:create')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (!IMAGE_EXT.has(ext) || !file.mimetype.startsWith('image/')) {
          cb(new BusinessException('仅支持图片文件（png/jpg/gif/webp/svg）', 40040), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadImage(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BusinessException('文件上传失败', 40041);
    return { url: `/uploads/${file.filename}`, name: file.originalname };
  }
}
