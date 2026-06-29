import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MinioService } from './minio.service';

export interface UploadedFileMeta {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
  ) {}

  /** Store an uploaded buffer in MinIO and register a FileObject row. Returns the FileObject. */
  async upload(
    file: UploadedFileMeta,
    opts: {
      companyId?: string;
      uploadedByUserId?: string;
      uploadedByCustomerId?: string;
      entityType?: string;
      entityId?: string;
      bucket?: string;
      keyPrefix?: string;
    } = {},
  ) {
    const bucket = opts.bucket ?? this.minio.bucketFiles;
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectKey = `${opts.keyPrefix ?? 'uploads'}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeName}`;

    await this.minio.putObject(bucket, objectKey, file.buffer, file.mimetype);

    return this.prisma.fileObject.create({
      data: {
        companyId: opts.companyId,
        bucket,
        objectKey,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedByUserId: opts.uploadedByUserId,
        uploadedByCustomerId: opts.uploadedByCustomerId,
        entityType: opts.entityType,
        entityId: opts.entityId,
      },
    });
  }

  async getMeta(fileId: string) {
    const file = await this.prisma.fileObject.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');
    return file;
  }

  /** Presigned download URL (1h). */
  async downloadUrl(fileId: string): Promise<{ url: string; fileName: string; mimeType: string }> {
    const file = await this.getMeta(fileId);
    const url = await this.minio.presignedGet(file.bucket, file.objectKey);
    return { url, fileName: file.fileName, mimeType: file.mimeType };
  }

  async buffer(fileId: string): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const file = await this.getMeta(fileId);
    const buffer = await this.minio.getObjectBuffer(file.bucket, file.objectKey);
    return { buffer, fileName: file.fileName, mimeType: file.mimeType };
  }
}
