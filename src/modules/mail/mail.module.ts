import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { EmailProcessor } from '../../queues/processors/email.processor';

@Module({
  providers: [MailService, EmailProcessor],
  exports: [MailService],
})
export class MailModule {}
