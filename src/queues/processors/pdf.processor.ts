import { Injectable } from '@nestjs/common';

// No-op processor — PDF queue disabled until BullMQ/Redis is provisioned
@Injectable()
export class PdfProcessor {
  async process(_job: any): Promise<void> {
    return;
  }
}
