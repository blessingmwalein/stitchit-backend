import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { StockService } from './stock.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  CreateCategoryDto, CreateWarehouseDto, UpdateWarehouseDto,
  CreateMaterialDto, UpdateMaterialDto, MaterialFilterDto,
  StockAdjustmentDto, MovementFilterDto,
} from './dto/inventory.dto';

// ── Categories ────────────────────────────────────────────────────────────────

@Controller('inventory/categories')
export class MaterialCategoriesController {
  constructor(private readonly inv: InventoryService) {}

  @Post()
  @RequirePermissions('inventory.write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCategoryDto) {
    return this.inv.createCategory(user.companyId, dto);
  }

  @Get()
  @RequirePermissions('inventory.read')
  list(@CurrentUser() user: AuthUser) {
    return this.inv.listCategories(user.companyId);
  }
}

// ── Warehouses ────────────────────────────────────────────────────────────────

@Controller('inventory/warehouses')
export class WarehousesController {
  constructor(private readonly inv: InventoryService) {}

  @Post()
  @RequirePermissions('inventory.write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWarehouseDto) {
    return this.inv.createWarehouse(user.companyId, dto);
  }

  @Get()
  @RequirePermissions('inventory.read')
  list(@CurrentUser() user: AuthUser) {
    return this.inv.listWarehouses(user.companyId);
  }

  @Patch(':id')
  @RequirePermissions('inventory.write')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.inv.updateWarehouse(user.companyId, id, dto);
  }
}

// ── Materials ────────────────────────────────────────────────────────────────

@Controller('inventory/materials')
export class MaterialsController {
  constructor(private readonly inv: InventoryService) {}

  @Post()
  @RequirePermissions('inventory.write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMaterialDto) {
    return this.inv.createMaterial(user.companyId, dto, user.sub);
  }

  @Get()
  @RequirePermissions('inventory.read')
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() filter: MaterialFilterDto,
    @Query() pagination: PaginationDto,
  ) {
    return this.inv.findAllMaterials(user.companyId, filter, pagination);
  }

  @Get('reorder-alerts')
  @RequirePermissions('inventory.read')
  reorderAlerts(@CurrentUser() user: AuthUser) {
    return this.inv.reorderAlerts(user.companyId);
  }

  @Get('valuation')
  @RequirePermissions('inventory.read')
  valuation(@CurrentUser() user: AuthUser) {
    return this.inv.valuation(user.companyId);
  }

  @Get(':id')
  @RequirePermissions('inventory.read')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.inv.findOneMaterial(user.companyId, id);
  }

  @Patch(':id')
  @RequirePermissions('inventory.write')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaterialDto,
  ) {
    return this.inv.updateMaterial(user.companyId, id, dto, user.sub);
  }

  @Delete(':id')
  @RequirePermissions('inventory.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.inv.deleteMaterial(user.companyId, id, user.sub);
  }
}

// ── Stock ─────────────────────────────────────────────────────────────────────

@Controller('inventory/stock')
export class StockController {
  constructor(
    private readonly inv: InventoryService,
    private readonly stock: StockService,
  ) {}

  @Get()
  @RequirePermissions('inventory.read')
  levels(@CurrentUser() user: AuthUser, @Query('warehouseId') warehouseId?: string) {
    return this.stock.bulkStockLevels(user.companyId, warehouseId);
  }

  @Post('adjust')
  @RequirePermissions('inventory.adjust')
  adjust(@CurrentUser() user: AuthUser, @Body() dto: StockAdjustmentDto) {
    return this.inv.adjust(user.companyId, dto, user.sub);
  }

  @Get('movements')
  @RequirePermissions('inventory.read')
  movements(
    @CurrentUser() user: AuthUser,
    @Query() filter: MovementFilterDto,
    @Query() pagination: PaginationDto,
  ) {
    return this.inv.findMovements(user.companyId, filter, pagination);
  }
}
