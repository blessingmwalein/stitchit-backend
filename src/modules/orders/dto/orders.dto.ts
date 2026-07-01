import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsPositive,
  IsDateString,
  IsUUID,
  IsArray,
  ValidateNested,
  Min,
  IsInt,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  OrderStatus,
  OrderPriority,
  SizeUnit,
  RugShape,
  Complexity,
} from '@prisma/client';

export class OrderItemDto {
  @IsInt()
  @Min(1)
  lineNo: number;

  @IsString()
  @MaxLength(200)
  rugName: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  widthCm: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  heightCm: number;

  @IsOptional()
  @IsEnum(SizeUnit)
  displayUnit?: SizeUnit;

  @IsOptional()
  @IsEnum(RugShape)
  shape?: RugShape;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  colors?: string[];

  @IsOptional()
  @IsEnum(Complexity)
  complexity?: Complexity;

  @IsOptional()
  @IsUUID()
  designFileId?: string;

  @IsOptional()
  @IsString()
  designFileUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateOrderDto {
  @IsUUID()
  customerId: string;

  @IsOptional()
  @IsEnum(OrderPriority)
  priority?: OrderPriority;

  @IsOptional()
  @IsDateString()
  promisedDate?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 8 })
  exchangeRate?: number;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  depositRequired?: number;

  @IsOptional()
  @IsDateString()
  createdAt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}

export class UpdateOrderDto {
  @IsOptional()
  @IsEnum(OrderPriority)
  priority?: OrderPriority;

  @IsOptional()
  @IsDateString()
  promisedDate?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  depositRequired?: number;
}

export class ChangeOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AddAttachmentDto {
  @IsUUID()
  fileId: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  kind?: string;
}

export class OrderFilterDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(OrderPriority)
  priority?: OrderPriority;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
