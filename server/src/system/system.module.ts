import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { UploadController } from './upload.controller';

@Module({
  controllers: [SystemController, UploadController],
})
export class SystemModule {}
