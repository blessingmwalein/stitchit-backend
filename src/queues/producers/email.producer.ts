import { Injectable } from '@nestjs/common';

export interface SendEmailJobData {
  to: string | string[];
  subject: string;
  templateName: string;
  context: Record<string, any>;
  attachments?: Array<{ filename: string; path?: string; content?: Buffer }>;
}

@Injectable()
export class EmailProducer {
  // No-op until BullMQ/Redis is provisioned
  async enqueue(_data: SendEmailJobData): Promise<void> {
    return;
  }
}
