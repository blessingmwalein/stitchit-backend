import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from './token.service';

interface GoogleProfile {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}

interface GoogleSessionPayload {
  sub: 'google-session';
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}

@Injectable()
export class GoogleOAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private get sessionSecret(): string {
    return this.config.get<string>('jwt.accessSecret') + '-google-session';
  }

  async resolveGoogleProfile(profile: GoogleProfile): Promise<{ sessionKey: string }> {
    const company = await this.prisma.company.findFirst({ where: { isActive: true } });
    if (!company) throw new BadRequestException('Service unavailable');

    // 1. Check by googleId (returning user)
    let existing = await this.prisma.customer.findFirst({
      where: { googleId: profile.googleId, deletedAt: null },
    });

    // 2. Check by email (existing email/password account — auto-link)
    if (!existing && profile.email) {
      existing = await this.prisma.customer.findFirst({
        where: { email: profile.email, deletedAt: null },
      });
      if (existing) {
        existing = await this.prisma.customer.update({
          where: { id: existing.id },
          data: {
            googleId: profile.googleId,
            ...(profile.avatarUrl && !existing.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
          },
        });
      }
    }

    // Encode profile into a signed JWT valid for 5 minutes
    const sessionKey = await this.jwt.signAsync(
      {
        sub: 'google-session',
        googleId: profile.googleId,
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        avatarUrl: profile.avatarUrl,
        // Embed whether this is a login or register
        customerId: existing?.id ?? null,
      } satisfies GoogleSessionPayload & { customerId: string | null },
      { secret: this.sessionSecret, expiresIn: 300 },
    );

    return { sessionKey };
  }

  async exchangeSession(sessionKey: string) {
    if (!sessionKey) throw new BadRequestException('Session expired or invalid');

    let payload: GoogleSessionPayload & { customerId: string | null };
    try {
      payload = await this.jwt.verifyAsync(sessionKey, { secret: this.sessionSecret });
    } catch {
      throw new BadRequestException('Session expired or invalid');
    }

    if (payload.customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: payload.customerId },
      });
      if (!customer) throw new BadRequestException('Account not found');

      const pair = await this.tokens.issuePair(
        {
          id: customer.id,
          companyId: customer.companyId,
          email: customer.email ?? undefined,
          name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || undefined,
        },
        'customer',
      );

      const { passwordHash: _, ...safeCustomer } = customer as any;
      return { type: 'login' as const, ...pair, customer: safeCustomer };
    }

    return {
      type: 'register' as const,
      googleId: payload.googleId,
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      avatarUrl: payload.avatarUrl ?? null,
    };
  }

  async completeRegistration(payload: {
    googleId: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    address?: string;
    avatarUrl?: string;
  }) {
    const company = await this.prisma.company.findFirst({ where: { isActive: true } });
    if (!company) throw new BadRequestException('Service unavailable');

    const existing = await this.prisma.customer.findFirst({
      where: { OR: [{ googleId: payload.googleId }, { email: payload.email }], deletedAt: null },
    });
    if (existing) {
      // Already registered — just log in
      const pair = await this.tokens.issuePair(
        {
          id: existing.id,
          companyId: existing.companyId,
          email: existing.email ?? undefined,
          name: [existing.firstName, existing.lastName].filter(Boolean).join(' ') || undefined,
        },
        'customer',
      );
      const { passwordHash: _, ...safeCustomer } = existing as any;
      return { ...pair, customer: safeCustomer };
    }

    const count = await this.prisma.customer.count({ where: { companyId: company.id } });
    const customerNumber = `CUST-${String(count + 1).padStart(5, '0')}`;

    const customer = await this.prisma.customer.create({
      data: {
        companyId: company.id,
        customerNumber,
        type: 'INDIVIDUAL',
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        address: payload.address,
        googleId: payload.googleId,
        avatarUrl: payload.avatarUrl,
        portalEnabled: true,
      },
    });

    const pair = await this.tokens.issuePair(
      {
        id: customer.id,
        companyId: company.id,
        email: customer.email ?? undefined,
        name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || undefined,
      },
      'customer',
    );

    const { passwordHash: _, ...safeCustomer } = customer as any;
    return { ...pair, customer: safeCustomer };
  }
}
