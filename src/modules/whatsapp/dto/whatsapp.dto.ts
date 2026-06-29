import { IsString, IsOptional, IsUUID, MaxLength, IsEnum } from 'class-validator';

export class SendWhatsAppDto {
  @IsString() @MaxLength(30) toNumber: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() leadId?: string;
  @IsString() @MaxLength(4096) message: string;
  @IsOptional() @IsString() templateName?: string;
  @IsOptional() @IsString() relatedType?: string;
  @IsOptional() @IsString() relatedId?: string;
}
