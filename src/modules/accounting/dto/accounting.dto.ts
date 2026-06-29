import {
  IsString, IsOptional, IsEnum, IsNumber, IsUUID, IsArray,
  IsBoolean, IsDateString, IsInt, Min, Max, MaxLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AccountType, AccountSubtype } from '@prisma/client';

// ── Chart of Accounts ─────────────────────────────────────────────────────────

export class CreateAccountDto {
  @IsString() @MaxLength(20) code: string;
  @IsString() @MaxLength(200) name: string;
  @IsEnum(AccountType) type: AccountType;
  @IsEnum(AccountSubtype) subtype: AccountSubtype;
  @IsOptional() @IsUUID() parentId?: string;
}

export class UpdateAccountDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Fiscal Periods ────────────────────────────────────────────────────────────

export class CreatePeriodDto {
  @IsInt() @Min(2020) @Max(2099) @Type(() => Number) year: number;
  @IsInt() @Min(1) @Max(12) @Type(() => Number) month: number;
}

// ── Journal Entries ───────────────────────────────────────────────────────────

export class JournalLineDto {
  @IsUUID() accountId: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) debit?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) credit?: number;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 8 }) exchangeRate?: number;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsUUID() productionJobId?: string;
  @IsOptional() @IsUUID() orderId?: string;
}

export class CreateJournalEntryDto {
  @IsOptional() @IsDateString() entryDate?: string;
  @IsOptional() @IsString() @MaxLength(500) memo?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => JournalLineDto) lines: JournalLineDto[];
}

export class JournalFilterDto {
  @IsOptional() @IsString() fromDate?: string;
  @IsOptional() @IsString() toDate?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}
