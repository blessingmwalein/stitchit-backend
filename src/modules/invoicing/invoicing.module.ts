import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';
import { ExpensesService } from './expenses.service';
import { PayrollService } from './payroll.service';
import { InvoicingController } from './invoicing.controller';

@Module({
  imports: [AccountingModule],
  controllers: [InvoicingController],
  providers: [InvoicesService, PaymentsService, ExpensesService, PayrollService],
  exports: [InvoicesService, PaymentsService],
})
export class InvoicingModule {}
