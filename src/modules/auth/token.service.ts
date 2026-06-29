import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthAudience, AuthUser } from '../../common/decorators/current-user.decorator';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issuePair(
    principal: { id: string; companyId: string; email?: string; name?: string },
    aud: AuthAudience,
    meta?: { ip?: string; userAgent?: string },
    family?: string,
  ): Promise<TokenPair> {
    const payload: AuthUser = {
      sub: principal.id,
      companyId: principal.companyId,
      aud,
      email: principal.email,
      name: principal.name,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<number>('jwt.accessTtl'),
    });

    const tokenFamily = family ?? randomUUID();
    const refreshTtl = this.config.get<number>('jwt.refreshTtl')!;
    const refreshToken = await this.jwt.signAsync(
      { ...payload, family: tokenFamily, jti: randomUUID() },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: refreshTtl,
      },
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: aud === 'staff' ? principal.id : null,
        customerId: aud === 'customer' ? principal.id : null,
        tokenHash: this.hash(refreshToken),
        family: tokenFamily,
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
        ipAddress: meta?.ip,
        userAgent: meta?.userAgent,
      },
    });

    return { accessToken, refreshToken };
  }

  /** Rotate a refresh token. Reuse of an already-rotated token revokes the whole family. */
  async rotate(refreshToken: string, meta?: { ip?: string; userAgent?: string }): Promise<TokenPair> {
    let payload: AuthUser & { family: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(refreshToken) },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (stored.revokedAt) {
      // Token reuse detected — revoke the entire family.
      await this.prisma.refreshToken.updateMany({
        where: { family: stored.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issuePair(
      { id: payload.sub, companyId: payload.companyId, email: payload.email, name: payload.name },
      payload.aud,
      meta,
      stored.family,
    );
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
