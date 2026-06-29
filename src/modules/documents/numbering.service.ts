import { Injectable, NotFoundException } from '@nestjs/common';
import { DocType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

/**
 * Atomic per-company, per-doc-type document numbering.
 * UPDATE ... RETURNING takes a row lock, so concurrent callers serialize and
 * numbers are gapless within a transaction's success path.
 */
@Injectable()
export class NumberingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Issue the next formatted number, e.g. QT-2026-00042. Pass the surrounding tx when inside one. */
  async next(companyId: string, docType: DocType, tx?: Tx): Promise<string> {
    const db = tx ?? this.prisma;
    const year = new Date().getFullYear();

    // Yearly reset first (separate guarded update, idempotent under concurrency).
    await db.$executeRaw`
      UPDATE "NumberSequence"
      SET "nextNumber" = 1, "currentYear" = ${year}
      WHERE "companyId" = ${companyId}
        AND "docType" = ${docType}::"DocType"
        AND "yearlyReset" = true
        AND ("currentYear" IS NULL OR "currentYear" <> ${year})
    `;

    const rows = await db.$queryRaw<
      Array<{ nextNumber: number; prefix: string; padLength: number; yearlyReset: boolean }>
    >`
      UPDATE "NumberSequence"
      SET "nextNumber" = "nextNumber" + 1
      WHERE "companyId" = ${companyId} AND "docType" = ${docType}::"DocType"
      RETURNING "nextNumber" - 1 AS "nextNumber", prefix, "padLength", "yearlyReset"
    `;

    if (rows.length === 0) {
      throw new NotFoundException(`No number sequence configured for ${docType}`);
    }

    const { nextNumber, prefix, padLength, yearlyReset } = rows[0];
    const padded = String(nextNumber).padStart(padLength, '0');
    return yearlyReset ? `${prefix}-${year}-${padded}` : `${prefix}-${padded}`;
  }
}
