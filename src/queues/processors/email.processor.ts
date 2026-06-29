import { Injectable } from '@nestjs/common';

// No-op processor — email queue disabled until BullMQ/Redis is provisioned
@Injectable()
export class EmailProcessor {
  async process(_job: any): Promise<void> {
    return;
  }
}
