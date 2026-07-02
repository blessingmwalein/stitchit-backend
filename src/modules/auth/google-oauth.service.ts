import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from './token.service';

interface GoogleProfile {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}

interface PendingSession {
  profile: GoogleProfile;
  type: 'login' | 'register';
  customerId?: string;
  expiresAt: number;
}

@Injectable()
export class GoogleOAuthService {
  private readonly sessions = new Map<string, PendingSession>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

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
        // Link this Google account to the existing customer record
        existing = await this.prisma.customer.update({
          where: { id: existing.id },
          data: {
            googleId: profile.googleId,
            ...(profile.avatarUrl && !existing.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
          },
        });
      }
    }

    const sessionKey = randomUUID();
    const type = existing ? 'login' : 'register';

    this.sessions.set(sessionKey, {
      profile,
      type,
      customerId: existing?.id,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    setTimeout(() => this.sessions.delete(sessionKey), 5 * 60 * 1000);

    return { sessionKey };
  }

  async exchangeSession(sessionKey: string) {
    const session = this.sessions.get(sessionKey);
    if (!session || session.expiresAt < Date.now()) {
      this.sessions.delete(sessionKey);
      throw new BadRequestException('Session expired or invalid');
    }

    this.sessions.delete(sessionKey);

    if (session.type === 'login' && session.customerId) {
      const customer = await this.prisma.customer.findUniqueOrThrow({
        where: { id: session.customerId },
      });

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

    // New user — return profile data for registration form
    return {
      type: 'register' as const,
      googleId: session.profile.googleId,
      email: session.profile.email,
      firstName: session.profile.firstName,
      lastName: session.profile.lastName,
      avatarUrl: session.profile.avatarUrl ?? null,
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
