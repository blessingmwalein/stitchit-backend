import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService, TokenPair } from './token.service';
import { PermissionsCacheService } from '../rbac/permissions-cache.service';

export interface StaffProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  permissions: string[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly permissionsCache: PermissionsCacheService,
  ) {}

  async login(
    email: string,
    password: string,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<TokenPair & { user: StaffProfile }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const pair = await this.tokens.issuePair(
      { id: user.id, companyId: user.companyId, email: user.email, name: `${user.firstName} ${user.lastName}` },
      'staff',
      meta,
    );

    return { ...pair, user: await this.profile(user.id) };
  }

  async profile(userId: string): Promise<StaffProfile> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const permissions = await this.permissionsCache.getPermissions(userId);
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      permissions: [...permissions].sort(),
    };
  }

  refresh(refreshToken: string, meta?: { ip?: string; userAgent?: string }): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken, meta);
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.revoke(refreshToken);
  }
}
