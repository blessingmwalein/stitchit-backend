import { Injectable } from '@nestjs/common';
import { DocType } from '@prisma/client';

export interface GeneratePdfJobData {
  docType: DocType;
  docId: string;
  companyId: string;
  triggeredByUserId?: string;
  sendAfter?: {
    channel: 'email' | 'whatsapp';
    recipientId: string;
  };
}

@Injectable()
export class PdfProducer {
  // No-op until BullMQ/Redis is provisioned
  async enqueue(_data: GeneratePdfJobData): Promise<void> {
    return;
  }
}
