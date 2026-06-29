import {
  Controller, Get, Post, Patch, Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { PeriodsService } from './periods.service';
import { JournalService } from './journal.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import {
  CreateAccountDto, UpdateAccountDto,
  CreatePeriodDto,
  CreateJournalEntryDto, JournalFilterDto,
} from './dto/accounting.dto';

@Controller('accounting')
export class AccountingController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly periods: PeriodsService,
    private readonly journal: JournalService,
  ) {}

  // ── Chart of Accounts ─────────────────────────────────────────────────────

  @Get('accounts')
  @RequirePermissions('finance.read')
  listAccounts(@CurrentUser() u: AuthUser) {
    return this.accounts.findAll(u.companyId);
  }

  @Get('accounts/tree')
  @RequirePermissions('finance.read')
  accountTree(@CurrentUser() u: AuthUser) {
    return this.accounts.findTree(u.companyId);
  }

  @Get('accounts/:id')
  @RequirePermissions('finance.read')
  getAccount(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.findOne(u.companyId, id);
  }

  @Post('accounts')
  @RequirePermissions('finance.accounts.write')
  createAccount(@CurrentUser() u: AuthUser, @Body() dto: CreateAccountDto) {
    return this.accounts.create(u.companyId, dto);
  }

  @Patch('accounts/:id')
  @RequirePermissions('finance.accounts.write')
  updateAccount(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accounts.update(u.companyId, id, dto);
  }

  // ── Fiscal Periods ─────────────────────────────────────────────────────────

  @Get('periods')
  @RequirePermissions('finance.read')
  listPeriods(@CurrentUser() u: AuthUser) {
    return this.periods.findAll(u.companyId);
  }

  @Post('periods')
  @RequirePermissions('finance.periods.write')
  createPeriod(@CurrentUser() u: AuthUser, @Body() dto: CreatePeriodDto) {
    return this.periods.create(u.companyId, dto);
  }

  @Post('periods/:id/close')
  @RequirePermissions('finance.periods.write')
  @HttpCode(HttpStatus.OK)
  closePeriod(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.periods.close(u.companyId, id);
  }

  @Post('periods/:id/reopen')
  @RequirePermissions('finance.periods.write')
  @HttpCode(HttpStatus.OK)
  reopenPeriod(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.periods.reopen(u.companyId, id);
  }

  // ── Journal Entries ────────────────────────────────────────────────────────

  @Get('journal')
  @RequirePermissions('finance.read')
  listJournal(@CurrentUser() u: AuthUser, @Query() filter: JournalFilterDto) {
    return this.journal.findAll(u.companyId, filter);
  }

  @Get('journal/:id')
  @RequirePermissions('finance.read')
  getJournalEntry(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.journal.findOne(u.companyId, id);
  }

  @Post('journal')
  @RequirePermissions('finance.journal.write')
  createJournalEntry(@CurrentUser() u: AuthUser, @Body() dto: CreateJournalEntryDto) {
    return this.journal.createManual(u.companyId, dto, u.sub);
  }

  @Post('journal/:id/reverse')
  @RequirePermissions('finance.journal.write')
  @HttpCode(HttpStatus.OK)
  reverseEntry(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.journal.reverse(u.companyId, id, u.sub);
  }
}
