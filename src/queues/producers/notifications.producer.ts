import { Injectable } from '@nestjs/common';

export interface NotifyFanOutJobData {
  companyId: string;
  type?: string;
  title: string;
  body: string;
  extra?: Record<string, any>;
  roles?: string[];
  userIds?: string[];
}

@Injectable()
export class NotificationsProducer {
  // No-op until BullMQ/Redis is provisioned
  async fanOut(_data: NotifyFanOutJobData): Promise<void> {
    return;
  }
}
