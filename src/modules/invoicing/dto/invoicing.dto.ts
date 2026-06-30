import {
  IsString, IsOptional, IsEnum, IsNumber, IsUUID, IsArray, IsBoolean,
  IsDateString, IsPositive, ValidateNested, MaxLength, IsInt, Min, Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceType, PaymentMethod } from '@prisma/client';

// ── Invoices ──────────────────────────────────────────────────────────────────

export class InvoiceItemDto {
  @IsInt() @Min(1) @Type(() => Number) lineNo: number;
  @IsString() @MaxLength(500) description: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive() quantity: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive() unitPrice: number;
}

export class CreateInvoiceDto {
  @IsUUID() customerId: string;
  @IsOptional() @IsUUID() orderId?: string;
  @IsOptional() @IsEnum(InvoiceType) type?: InvoiceType;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 8 }) exchangeRate?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) discountTotal?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) taxTotal?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => InvoiceItemDto) items: InvoiceItemDto[];
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class UpdateInvoiceDto {
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class InvoiceFilterDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsString() fromDate?: string;
  @IsOptional() @IsString() toDate?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

// ── Payments ──────────────────────────────────────────────────────────────────

export class AllocatePaymentDto {
  @IsUUID() invoiceId: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive() amount: number;
}

export class CreatePaymentDto {
  @IsUUID() customerId: string;
  @IsOptional() @IsUUID() orderId?: string;
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive() amount: number;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 8 }) exchangeRate?: number;
  @IsOptional() @IsDateString() paymentDate?: string;
  @IsOptional() @IsBoolean() isDeposit?: boolean;
  @IsOptional() @IsString() @MaxLength(200) reference?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AllocatePaymentDto)
  allocations?: AllocatePaymentDto[];
}

export class AllocateDto {
  @IsUUID() invoiceId: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive() amount: number;
}

export class PaymentFilterDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() orderId?: string;
  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
  @IsOptional() @IsBoolean() @Type(() => Boolean) isDeposit?: boolean;
  @IsOptional() @IsString() fromDate?: string;
  @IsOptional() @IsString() toDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export class CreateExpenseDto {
  @IsDateString() date: string;
  @IsUUID() expenseAccountId: string;
  @IsUUID() paidFromAccountId: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive() amount: number;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 8 }) exchangeRate?: number;
  @IsOptional() @IsString() @MaxLength(200) payee?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

// ── Payroll ───────────────────────────────────────────────────────────────────

export class PayrollLineDto {
  @IsOptional() @IsUUID() userId?: string;
  @IsString() @MaxLength(200) staffName: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) gross: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) deductions?: number;
}

export class CreatePayrollRunDto {
  @IsInt() @Min(2020) @Max(2099) @Type(() => Number) periodYear: number;
  @IsInt() @Min(1) @Max(12) @Type(() => Number) periodMonth: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PayrollLineDto) lines: PayrollLineDto[];
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
