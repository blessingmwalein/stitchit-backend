import { Injectable } from '@nestjs/common';

// MinIO disabled — file storage not yet provisioned
@Injectable()
export class MinioService {
  readonly bucketFiles = 'stitchit-files';
  readonly bucketDocuments = 'stitchit-documents';

  async putObject(_bucket: string, _key: string, _buffer: Buffer, _mimeType: string): Promise<void> {
    return;
  }

  async getObject(_bucket: string, _key: string): Promise<null> {
    return null;
  }

  async getObjectBuffer(_bucket: string, _key: string): Promise<Buffer> {
    return Buffer.alloc(0);
  }

  async removeObject(_bucket: string, _key: string): Promise<void> {
    return;
  }

  async presignedPut(_bucket: string, _key: string): Promise<string> {
    return '';
  }

  async presignedGet(_bucket: string, _key: string): Promise<string> {
    return '';
  }
}
