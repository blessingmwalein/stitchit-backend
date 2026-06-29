import {
  IsString, IsEmail, IsOptional, IsUUID, MinLength, MaxLength, IsEnum,
} from 'class-validator';

export class PortalLoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
}

export class PortalRegisterDto {
  @IsString() @MaxLength(100) firstName: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}

export class PortalRefreshDto {
  @IsString() refreshToken: string;
}

export class PortalUpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}

export class ApproveQuoteDto {
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class RejectQuoteDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
