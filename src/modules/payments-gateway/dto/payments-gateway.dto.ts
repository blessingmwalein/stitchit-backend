import { IsString, IsNumber, IsOptional, IsUUID, IsBoolean, Min } from 'class-validator';

export class InitiatePaynowDto {
  @IsUUID() customerId: string;
  @IsOptional() @IsUUID() orderId?: string;
  @IsOptional() @IsUUID() invoiceId?: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsString() email: string;
  @IsString() reference: string;
  @IsOptional() @IsBoolean() isDeposit?: boolean;
}

