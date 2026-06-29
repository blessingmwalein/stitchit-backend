import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LeadsService } from './leads.service';
import { CustomersService } from './customers.service';
import { CommunicationsService } from './communications.service';
import { FollowUpsService } from './follow-ups.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  CreateLeadDto,
  UpdateLeadDto,
  ChangeLeadStageDto,
  ConvertLeadDto,
  LeadFilterDto,
  CreateCustomerDto,
  UpdateCustomerDto,
  EnablePortalDto,
  CustomerFilterDto,
  CreateCommunicationDto,
  CreateFollowUpDto,
  UpdateFollowUpDto,
} from './dto/crm.dto';

// ── Leads ────────────────────────────────────────────────────────────────────

@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly comms: CommunicationsService,
  ) {}

  @Post()
  @RequirePermissions('crm.leads.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLeadDto) {
    return this.leads.create(user.companyId, dto, user.sub);
  }

  @Get()
  @RequirePermissions('crm.leads.read')
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() filter: LeadFilterDto,
    @Query() pagination: PaginationDto,
  ) {
    return this.leads.findAll(user.companyId, filter, pagination);
  }

  @Get('kanban')
  @RequirePermissions('crm.leads.read')
  kanban(@CurrentUser() user: AuthUser) {
    return this.leads.kanban(user.companyId);
  }

  @Get('follow-ups/overdue')
  @RequirePermissions('crm.follow_ups.read')
  overdueFollowUps(@CurrentUser() user: AuthUser) {
    // convenience alias — delegated to FollowUpsController
    return [];
  }

  @Get(':id')
  @RequirePermissions('crm.leads.read')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.leads.findOne(user.companyId, id);
  }

  @Patch(':id')
  @RequirePermissions('crm.leads.update')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leads.update(user.companyId, id, dto, user.sub);
  }

  @Patch(':id/stage')
  @RequirePermissions('crm.leads.update')
  changeStage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeLeadStageDto,
  ) {
    return this.leads.changeStage(user.companyId, id, dto, user.sub);
  }

  @Post(':id/convert')
  @RequirePermissions('crm.leads.convert')
  convert(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertLeadDto,
  ) {
    return this.leads.convertToCustomer(user.companyId, id, dto, user.sub);
  }

  @Delete(':id')
  @RequirePermissions('crm.leads.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.leads.remove(user.companyId, id, user.sub);
  }

  @Get(':id/communications')
  @RequirePermissions('crm.leads.read')
  getComms(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.comms.findForLead(user.companyId, id, pagination);
  }

  @Post(':id/communications')
  @RequirePermissions('crm.communications.create')
  addComm(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommunicationDto,
  ) {
    return this.comms.create(user.companyId, { ...dto, leadId: id }, user.sub);
  }
}

// ── Customers ────────────────────────────────────────────────────────────────

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly comms: CommunicationsService,
  ) {}

  @Post()
  @RequirePermissions('crm.customers.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerDto) {
    return this.customers.create(user.companyId, dto, user.sub);
  }

  @Get()
  @RequirePermissions('crm.customers.read')
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() filter: CustomerFilterDto,
    @Query() pagination: PaginationDto,
  ) {
    return this.customers.findAll(user.companyId, filter, pagination);
  }

  @Get(':id')
  @RequirePermissions('crm.customers.read')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.customers.findOne(user.companyId, id);
  }

  @Patch(':id')
  @RequirePermissions('crm.customers.update')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(user.companyId, id, dto, user.sub);
  }

  @Post(':id/portal/enable')
  @RequirePermissions('crm.customers.update')
  enablePortal(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EnablePortalDto,
  ) {
    return this.customers.enablePortal(user.companyId, id, dto, user.sub);
  }

  @Post(':id/portal/disable')
  @RequirePermissions('crm.customers.update')
  disablePortal(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.customers.disablePortal(user.companyId, id, user.sub);
  }

  @Delete(':id')
  @RequirePermissions('crm.customers.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.customers.remove(user.companyId, id, user.sub);
  }

  @Get(':id/communications')
  @RequirePermissions('crm.customers.read')
  getComms(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.comms.findForCustomer(user.companyId, id, pagination);
  }

  @Post(':id/communications')
  @RequirePermissions('crm.communications.create')
  addComm(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommunicationDto,
  ) {
    return this.comms.create(user.companyId, { ...dto, customerId: id }, user.sub);
  }
}

// ── Communications (standalone) ──────────────────────────────────────────────

@Controller('communications')
export class CommunicationsController {
  constructor(private readonly comms: CommunicationsService) {}

  @Post()
  @RequirePermissions('crm.communications.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCommunicationDto) {
    return this.comms.create(user.companyId, dto, user.sub);
  }
}

// ── Follow-ups ────────────────────────────────────────────────────────────────

@Controller('follow-ups')
export class FollowUpsController {
  constructor(private readonly followUps: FollowUpsService) {}

  @Post()
  @RequirePermissions('crm.follow_ups.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFollowUpDto) {
    return this.followUps.create(user.companyId, dto, user.sub);
  }

  @Get()
  @RequirePermissions('crm.follow_ups.read')
  findAll(@CurrentUser() user: AuthUser, @Query() pagination: PaginationDto) {
    return this.followUps.findAll(user.companyId, pagination);
  }

  @Get('overdue')
  @RequirePermissions('crm.follow_ups.read')
  overdue(@CurrentUser() user: AuthUser) {
    return this.followUps.overdue(user.companyId);
  }

  @Patch(':id')
  @RequirePermissions('crm.follow_ups.update')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFollowUpDto,
  ) {
    return this.followUps.update(user.companyId, id, dto);
  }

  @Post(':id/complete')
  @RequirePermissions('crm.follow_ups.update')
  complete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.followUps.complete(user.companyId, id);
  }

  @Delete(':id')
  @RequirePermissions('crm.follow_ups.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.followUps.remove(user.companyId, id);
  }
}
