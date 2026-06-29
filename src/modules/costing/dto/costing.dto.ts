import { IsNumber, IsOptional, IsEnum, IsBoolean, Min, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export enum ComplexityLevel {
  SIMPLE = 'SIMPLE',
  MEDIUM = 'MEDIUM',
  COMPLEX = 'COMPLEX',
  VERY_COMPLEX = 'VERY_COMPLEX',
}

export enum ShapeType {
  RECTANGLE = 'RECTANGLE',
  SQUARE = 'SQUARE',
  CIRCLE = 'CIRCLE',
  OVAL = 'OVAL',
  RUNNER = 'RUNNER',
  IRREGULAR = 'IRREGULAR',
  CUSTOM = 'CUSTOM',
}

export class PriceCalculateDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() widthCm: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() heightCm: number;
  @IsEnum(ComplexityLevel) complexity: ComplexityLevel;
  @IsEnum(ShapeType) shape: ShapeType;
  @IsOptional() @IsBoolean() @Type(() => Boolean) isRush?: boolean;
}

export class UpdateCostSheetDto {
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) plannedMaterialCost?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) plannedLabourCost?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) plannedOverhead?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) packagingCost?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) deliveryCost?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) sellingPrice?: number;
}
