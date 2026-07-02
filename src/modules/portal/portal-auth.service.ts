import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from '../auth/token.service';
import { PortalLoginDto, PortalRegisterDto, PortalRefreshDto } from './dto/portal.dto';

@Injectable()
export class PortalAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async login(dto: PortalLoginDto, meta?: { ip?: string; userAgent?: string }) {
    const customer = await this.prisma.customer.findFirst({
      where: { email: dto.email, portalEnabled: true, deletedAt: null },
    });
    if (!customer?.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, customer.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const pair = await this.tokens.issuePair(
      {
        id: customer.id,
        companyId: customer.companyId,
        email: customer.email ?? undefined,
        name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.companyName || undefined,
      },
      'customer',
      meta,
    );

    const { passwordHash, ...safeCustomer } = customer as any;
    return { ...pair, customer: safeCustomer };
  }

  async register(companyId: string | undefined, dto: PortalRegisterDto, meta?: { ip?: string; userAgent?: string }) {
    if (!companyId) {
      const company = await this.prisma.company.findFirst({ where: { isActive: true } });
      if (!company) throw new BadRequestException('Service unavailable');
      companyId = company.id;
    }

    const existing = await this.prisma.customer.findFirst({
      where: { email: dto.email, companyId },
    });
    if (existing) throw new BadRequestException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const count = await this.prisma.customer.count({ where: { companyId } });
    const customerNumber = `CUST-${String(count + 1).padStart(5, '0')}`;

    const customer = await this.prisma.customer.create({
      data: {
        companyId,
        customerNumber,
        type: 'INDIVIDUAL',
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        portalEnabled: true,
      },
    });

    const pair = await this.tokens.issuePair(
      {
        id: customer.id,
        companyId,
        email: customer.email ?? undefined,
        name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || undefined,
      },
      'customer',
      meta,
    );

    const { passwordHash: _, ...safeCustomer } = customer as any;
    return { ...pair, customer: safeCustomer };
  }

  async refresh(dto: PortalRefreshDto, meta?: { ip?: string; userAgent?: string }) {
    const pair = await this.tokens.rotate(dto.refreshToken, meta);
    return pair;
  }

  async logout(refreshToken: string) {
    await this.tokens.revoke(refreshToken);
    return { message: 'Logged out' };
  }
}
