import {
  IsString, IsOptional, IsEnum, IsNumber, IsPositive, IsUUID,
  IsArray, ValidateNested, Min, IsInt, MaxLength, IsDateString, IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

// ── Suppliers ────────────────────────────────────────────────────────────────

export class CreateSupplierDto {
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() whatsappNumber?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) paymentTermsDays?: number;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateSupplierDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) paymentTermsDays?: number;
  @IsOptional() @IsString() notes?: string;
}

// ── Purchase Orders ───────────────────────────────────────────────────────────

export class PoItemDto {
  @IsUUID() materialId: string;
  @IsOptional() @IsString() description?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive() qty: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) unitCost: number;
}

export class CreatePurchaseOrderDto {
  @IsUUID() supplierId: string;
  @IsOptional() @IsDateString() expectedDate?: string;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 8 }) exchangeRate?: number;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PoItemDto) items: PoItemDto[];
}

export class UpdatePurchaseOrderDto {
  @IsOptional() @IsDateString() expectedDate?: string;
  @IsOptional() @IsString() notes?: string;
}

// ── GRN ──────────────────────────────────────────────────────────────────────

export class GrnItemDto {
  @IsUUID() materialId: string;
  @IsOptional() @IsUUID() poItemId?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive() qtyReceived: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) qtyRejected?: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) unitCost: number;
}

export class CreateGrnDto {
  @IsOptional() @IsUUID() poId?: string;
  @IsUUID() supplierId: string;
  @IsUUID() warehouseId: string;
  @IsOptional() @IsDateString() receivedDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => GrnItemDto) items: GrnItemDto[];
}

// ── Supplier Invoices ─────────────────────────────────────────────────────────

export class SupplierInvoiceItemDto {
  @IsString() description: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) qty: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) unitCost: number;
}

export class CreateSupplierInvoiceDto {
  @IsUUID() supplierId: string;
  @IsOptional() @IsUUID() grnId?: string;
  @IsOptional() @IsString() supplierRef?: string;
  @IsOptional() @IsDateString() invoiceDate?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 8 }) exchangeRate?: number;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => SupplierInvoiceItemDto) items: SupplierInvoiceItemDto[];
}

// ── Supplier Payments ─────────────────────────────────────────────────────────

export class SupplierPaymentAllocationDto {
  @IsUUID() supplierInvoiceId: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive() amount: number;
}

export class CreateSupplierPaymentDto {
  @IsUUID() supplierId: string;
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive() amount: number;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsDateString() paymentDate?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SupplierPaymentAllocationDto) allocations?: SupplierPaymentAllocationDto[];
}

// ── Filters ───────────────────────────────────────────────────────────────────

export class SupplierFilterDto {
  @IsOptional() @IsString() search?: string;
}

export class PoFilterDto {
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() search?: string;
}
