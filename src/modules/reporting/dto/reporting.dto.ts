import { IsOptional, IsString, IsUUID, IsDateString } from 'class-validator';

export class DateRangeDto {
  @IsDateString() fromDate: string;
  @IsDateString() toDate: string;
}

export class AccountLedgerDto {
  @IsUUID() accountId: string;
  @IsDateString() fromDate: string;
  @IsDateString() toDate: string;
}

export class CustomerStatementDto {
  @IsUUID() customerId: string;
  @IsDateString() fromDate: string;
  @IsDateString() toDate: string;
}

export class AgingDto {
  @IsOptional() @IsString() asOf?: string; // defaults to today
}
