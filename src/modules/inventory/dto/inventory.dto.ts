import {
  IsString, IsOptional, IsEnum, IsNumber, IsPositive, IsUUID,
  IsBoolean, Min, MaxLength, IsInt,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Uom, StockMovementType } from '@prisma/client';

// ── Categories ───────────────────────────────────────────────────────────────

export class CreateCategoryDto {
  @IsString() @MaxLength(100) name: string;
}

// ── Warehouses ────────────────────────────────────────────────────────────────

export class CreateWarehouseDto {
  @IsString() @MaxLength(100) name: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateWarehouseDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Materials ────────────────────────────────────────────────────────────────

export class CreateMaterialDto {
  @IsString() @MaxLength(50) sku: string;
  @IsString() @MaxLength(200) name: string;
  @IsUUID() categoryId: string;
  @IsEnum(Uom) uom: Uom;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) reorderLevel?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) reorderQty?: number;
}

export class UpdateMaterialDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsEnum(Uom) uom?: Uom;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) reorderLevel?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) reorderQty?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class MaterialFilterDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === 'true' || value === true) isActive?: boolean;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === 'true' || value === true) belowReorder?: boolean;
  @IsOptional() @IsString() search?: string;
}

// ── Stock Adjustments ─────────────────────────────────────────────────────────

export class StockAdjustmentDto {
  @IsUUID() materialId: string;
  @IsUUID() warehouseId: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) qty: number; // positive or negative
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) unitCost?: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

// ── Stock Movement filter ─────────────────────────────────────────────────────

export class MovementFilterDto {
  @IsOptional() @IsUUID() materialId?: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsEnum(StockMovementType) type?: StockMovementType;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
}
