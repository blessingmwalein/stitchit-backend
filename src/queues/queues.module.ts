import { Global, Module } from '@nestjs/common';
import { PdfProducer } from './producers/pdf.producer';
import { EmailProducer } from './producers/email.producer';
import { NotificationsProducer } from './producers/notifications.producer';

// Redis / BullMQ disabled — queues are no-ops until Redis is provisioned
@Global()
@Module({
  providers: [PdfProducer, EmailProducer, NotificationsProducer],
  exports: [PdfProducer, EmailProducer, NotificationsProducer],
})
export class QueuesModule {}
