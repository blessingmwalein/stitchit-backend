import {
  IsString, IsOptional, IsEnum, IsNumber, IsUUID,
  IsArray, Min, IsInt, MaxLength, IsDateString, IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JobStatus, StageStatus, OrderPriority } from '@prisma/client';

// ── Jobs ──────────────────────────────────────────────────────────────────────

export class CreateJobsFromOrderDto {
  @IsUUID() orderId: string;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) itemIds?: string[]; // if absent, all items
}

export class UpdateJobDto {
  @IsOptional() @IsUUID() assignedManagerUserId?: string;
  @IsOptional() @IsEnum(OrderPriority) priority?: OrderPriority;
  @IsOptional() @IsDateString() scheduledStart?: string;
  @IsOptional() @IsDateString() scheduledEnd?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class JobFilterDto {
  @IsOptional() @IsEnum(JobStatus) status?: JobStatus;
  @IsOptional() @IsEnum(OrderPriority) priority?: OrderPriority;
  @IsOptional() @IsUUID() assignedManagerUserId?: string;
  @IsOptional() @IsUUID() orderId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
}

// ── Stage operations ──────────────────────────────────────────────────────────

export class AssignStageDto {
  @IsUUID() userId: string;
}

export class CompleteStageDto {
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) timeSpentMinutes?: number;
}

export class LogStageEventDto {
  @IsString() event: string; // START | PAUSE | RESUME | COMPLETE | FAIL | REASSIGN
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class AddStageImageDto {
  @IsUUID() fileId: string;
  @IsOptional() @IsString() @MaxLength(200) caption?: string;
}

// ── Material allocation ───────────────────────────────────────────────────────

export class PlanAllocationDto {
  @IsUUID() materialId: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive() plannedQty: number;
}

export class IssueAllocationDto {
  @IsUUID() materialId: string;
  @IsUUID() warehouseId: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive() qty: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class RecordWasteDto {
  @IsUUID() materialId: string;
  @IsUUID() warehouseId: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive() wasteQty: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
