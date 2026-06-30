import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';
import { ExpensesService } from './expenses.service';
import { PayrollService } from './payroll.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import {
  CreateInvoiceDto, UpdateInvoiceDto, InvoiceFilterDto,
  CreatePaymentDto, AllocateDto, PaymentFilterDto,
  CreateExpenseDto,
  CreatePayrollRunDto,
} from './dto/invoicing.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Controller()
export class InvoicingController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly payments: PaymentsService,
    private readonly expenses: ExpensesService,
    private readonly payroll: PayrollService,
  ) {}

  // ── Invoices ───────────────────────────────────────────────────────────────

  @Get('invoices')
  @RequirePermissions('finance.invoices.read')
  listInvoices(@CurrentUser() u: AuthUser, @Query() filter: InvoiceFilterDto) {
    return this.invoices.findAll(u.companyId, filter);
  }

  @Get('invoices/:id')
  @RequirePermissions('finance.invoices.read')
  getInvoice(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.findOne(u.companyId, id);
  }

  @Post('invoices')
  @RequirePermissions('finance.invoices.write')
  createInvoice(@CurrentUser() u: AuthUser, @Body() dto: CreateInvoiceDto) {
    return this.invoices.create(u.companyId, dto, u.sub);
  }

  @Patch('invoices/:id')
  @RequirePermissions('finance.invoices.write')
  updateInvoice(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoices.update(u.companyId, id, dto);
  }

  @Post('invoices/:id/post')
  @RequirePermissions('finance.invoices.post')
  @HttpCode(HttpStatus.OK)
  postInvoice(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.post(u.companyId, id, u.sub);
  }

  @Post('invoices/:id/void')
  @RequirePermissions('finance.invoices.write')
  @HttpCode(HttpStatus.OK)
  voidInvoice(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.void(u.companyId, id);
  }

  @Post('invoices/:id/mark-paid')
  @RequirePermissions('finance.invoices.write')
  @HttpCode(HttpStatus.OK)
  markInvoicePaid(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.markPaid(u.companyId, id);
  }

  @Delete('invoices/:id')
  @RequirePermissions('finance.invoices.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteInvoice(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.softDelete(u.companyId, id);
  }

  // ── Payments ───────────────────────────────────────────────────────────────

  @Get('payments')
  @RequirePermissions('finance.payments.read')
  listPayments(@CurrentUser() u: AuthUser, @Query() filter: PaymentFilterDto) {
    return this.payments.findAll(u.companyId, filter);
  }

  @Get('payments/:id')
  @RequirePermissions('finance.payments.read')
  getPayment(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.findOne(u.companyId, id);
  }

  @Post('payments')
  @RequirePermissions('finance.payments.write')
  createPayment(@CurrentUser() u: AuthUser, @Body() dto: CreatePaymentDto) {
    return this.payments.create(u.companyId, dto, u.sub);
  }

  @Post('payments/:id/allocate')
  @RequirePermissions('finance.payments.write')
  @HttpCode(HttpStatus.OK)
  allocatePayment(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AllocateDto,
  ) {
    return this.payments.allocate(u.companyId, id, dto, u.sub);
  }

  // ── Expenses ───────────────────────────────────────────────────────────────

  @Get('expenses')
  @RequirePermissions('finance.read')
  listExpenses(
    @CurrentUser() u: AuthUser,
    @Query() pagination: PaginationDto,
    @Query('excludeCategory') excludeCategory?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('category') category?: string,
  ) {
    return this.expenses.findAll(
      u.companyId, pagination.page, pagination.pageSize,
      excludeCategory, fromDate, toDate, category,
    );
  }

  @Get('expenses/:id')
  @RequirePermissions('finance.read')
  getExpense(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.expenses.findOne(u.companyId, id);
  }

  @Post('expenses')
  @RequirePermissions('finance.expenses.write')
  createExpense(@CurrentUser() u: AuthUser, @Body() dto: CreateExpenseDto) {
    return this.expenses.create(u.companyId, dto, u.sub);
  }

  @Patch('expenses/:id')
  @RequirePermissions('finance.expenses.write')
  updateExpense(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { description?: string; payee?: string; category?: string },
  ) {
    return this.expenses.update(u.companyId, id, dto);
  }

  @Delete('expenses/:id')
  @RequirePermissions('finance.expenses.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteExpense(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.expenses.remove(u.companyId, id);
  }

  // ── Payroll ────────────────────────────────────────────────────────────────

  @Get('payroll')
  @RequirePermissions('finance.read')
  listPayroll(@CurrentUser() u: AuthUser) {
    return this.payroll.findAll(u.companyId);
  }

  @Get('payroll/:id')
  @RequirePermissions('finance.read')
  getPayrollRun(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.findOne(u.companyId, id);
  }

  @Post('payroll')
  @RequirePermissions('finance.payroll.write')
  createPayrollRun(@CurrentUser() u: AuthUser, @Body() dto: CreatePayrollRunDto) {
    return this.payroll.create(u.companyId, dto, u.sub);
  }
}
