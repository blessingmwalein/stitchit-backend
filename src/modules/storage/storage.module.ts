import { Global, Module } from '@nestjs/common';
import { MinioService } from './minio.service';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';

@Global()
@Module({
  controllers: [FilesController],
  providers: [MinioService, FilesService],
  exports: [MinioService, FilesService],
})
export class StorageModule {}
