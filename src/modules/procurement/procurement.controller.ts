import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ProcurementService } from './procurement.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  CreateSupplierDto, UpdateSupplierDto, SupplierFilterDto,
  CreatePurchaseOrderDto, UpdatePurchaseOrderDto, PoFilterDto,
  CreateGrnDto, CreateSupplierInvoiceDto, CreateSupplierPaymentDto,
} from './dto/procurement.dto';

// ── Suppliers ─────────────────────────────────────────────────────────────────

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly proc: ProcurementService) {}

  @Post()
  @RequirePermissions('procurement.suppliers.write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSupplierDto) {
    return this.proc.createSupplier(user.companyId, dto, user.sub);
  }

  @Get()
  @RequirePermissions('procurement.suppliers.read')
  findAll(@CurrentUser() user: AuthUser, @Query() filter: SupplierFilterDto, @Query() pagination: PaginationDto) {
    return this.proc.findAllSuppliers(user.companyId, filter, pagination);
  }

  @Get(':id')
  @RequirePermissions('procurement.suppliers.read')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.proc.findOneSupplier(user.companyId, id);
  }

  @Patch(':id')
  @RequirePermissions('procurement.suppliers.write')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSupplierDto) {
    return this.proc.updateSupplier(user.companyId, id, dto, user.sub);
  }

  @Delete(':id')
  @RequirePermissions('procurement.suppliers.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.proc.deleteSupplier(user.companyId, id, user.sub);
  }
}

// ── Purchase Orders ───────────────────────────────────────────────────────────

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly proc: ProcurementService) {}

  @Post()
  @RequirePermissions('procurement.pos.write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePurchaseOrderDto) {
    return this.proc.createPO(user.companyId, dto, user.sub);
  }

  @Get()
  @RequirePermissions('procurement.pos.read')
  findAll(@CurrentUser() user: AuthUser, @Query() filter: PoFilterDto, @Query() pagination: PaginationDto) {
    return this.proc.findAllPOs(user.companyId, filter, pagination);
  }

  @Get(':id')
  @RequirePermissions('procurement.pos.read')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.proc.findOnePO(user.companyId, id);
  }

  @Post(':id/send')
  @RequirePermissions('procurement.pos.write')
  send(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.proc.sendPO(user.companyId, id, user.sub);
  }

  @Post(':id/cancel')
  @RequirePermissions('procurement.pos.write')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.proc.cancelPO(user.companyId, id, user.sub);
  }
}

// ── GRNs ──────────────────────────────────────────────────────────────────────

@Controller('grns')
export class GrnsController {
  constructor(private readonly proc: ProcurementService) {}

  @Post()
  @RequirePermissions('procurement.grns.write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGrnDto) {
    return this.proc.createGRN(user.companyId, dto, user.sub);
  }

  @Get()
  @RequirePermissions('procurement.grns.read')
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('supplierId') supplierId: string | undefined,
    @Query() pagination: PaginationDto,
  ) {
    return this.proc.findAllGRNs(user.companyId, supplierId, pagination);
  }

  @Get(':id')
  @RequirePermissions('procurement.grns.read')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.proc.findOneGRN(user.companyId, id);
  }
}

// ── Supplier Invoices (Bills) ─────────────────────────────────────────────────

@Controller('bills')
export class BillsController {
  constructor(private readonly proc: ProcurementService) {}

  @Post()
  @RequirePermissions('procurement.bills.write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSupplierInvoiceDto) {
    return this.proc.createBill(user.companyId, dto, user.sub);
  }

  @Get()
  @RequirePermissions('procurement.bills.read')
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('supplierId') supplierId: string | undefined,
    @Query() pagination: PaginationDto,
  ) {
    return this.proc.findAllBills(user.companyId, supplierId, pagination);
  }
}

// ── Supplier Payments ─────────────────────────────────────────────────────────

@Controller('supplier-payments')
export class SupplierPaymentsController {
  constructor(private readonly proc: ProcurementService) {}

  @Post()
  @RequirePermissions('procurement.payments.write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSupplierPaymentDto) {
    return this.proc.createPayment(user.companyId, dto, user.sub);
  }

  @Get()
  @RequirePermissions('procurement.payments.read')
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('supplierId') supplierId: string | undefined,
    @Query() pagination: PaginationDto,
  ) {
    return this.proc.findAllPayments(user.companyId, supplierId, pagination);
  }
}
