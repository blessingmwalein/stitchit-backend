import { Injectable } from '@nestjs/common';

// No-op processor — notifications queue disabled until BullMQ/Redis is provisioned
@Injectable()
export class NotificationsProcessor {
  async process(_job: any): Promise<void> {
    return;
  }
}
