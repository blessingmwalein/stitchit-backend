import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { PeriodsService } from './periods.service';
import { JournalService } from './journal.service';
import { PostingService } from './posting.service';
import { AccountingController } from './accounting.controller';

@Module({
  controllers: [AccountingController],
  providers: [AccountsService, PeriodsService, JournalService, PostingService],
  exports: [AccountsService, PeriodsService, JournalService, PostingService],
})
export class AccountingModule {}
