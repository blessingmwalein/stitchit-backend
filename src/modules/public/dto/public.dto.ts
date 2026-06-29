import {
  IsString, IsEmail, IsOptional, IsEnum, MaxLength, IsNumber, IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum LeadSourcePublic {
  WEBSITE = 'WEBSITE',
  WHATSAPP = 'WHATSAPP',
  WALK_IN = 'WALK_IN',
}

export class CreatePublicLeadDto {
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(30) whatsappNumber?: string;
  @IsOptional() @IsEnum(LeadSourcePublic) source?: LeadSourcePublic;
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
  @IsOptional() @IsString() @MaxLength(100) referrer?: string;
}

export class PublicPriceDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() widthCm: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() heightCm: number;
  @IsOptional() @IsString() complexity?: string;
  @IsOptional() @IsString() shape?: string;
  @IsOptional() @IsString() isRush?: string;
}
