import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, JournalSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PeriodsService } from './periods.service';
import { NumberingService } from '../documents/numbering.service';
import { CreateJournalEntryDto, JournalFilterDto } from './dto/accounting.dto';
import Decimal from 'decimal.js';

export interface JournalLineInput {
  accountId: string;
  debit?: number | Decimal | string;
  credit?: number | Decimal | string;
  description?: string;
  currencyCode?: string;
  exchangeRate?: number | Decimal | string;
  customerId?: string;
  supplierId?: string;
  productionJobId?: string;
  orderId?: string;
}

export interface CreateEntryOpts {
  companyId: string;
  sourceType?: JournalSource;
  sourceId?: string;
  memo?: string;
  entryDate?: Date;
  lines: JournalLineInput[];
  postedByUserId?: string;
  tx?: Prisma.TransactionClient;
}

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly numbering: NumberingService,
  ) {}

  async createAndPost(opts: CreateEntryOpts): Promise<string> {
    const date = opts.entryDate ?? new Date();
    const fiscalPeriodId = await this.periods.resolve(opts.companyId, date);
    const db: Db = opts.tx ?? this.prisma;

    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);
    for (const line of opts.lines) {
      totalDebit = totalDebit.plus(new Decimal(line.debit ?? 0));
      totalCredit = totalCredit.plus(new Decimal(line.credit ?? 0));
    }

    if (!totalDebit.equals(totalCredit)) {
      throw new BadRequestException(
        `Journal entry not balanced: Dr ${totalDebit.toFixed(4)} ≠ Cr ${totalCredit.toFixed(4)}`,
      );
    }
    if (totalDebit.isZero()) {
      throw new BadRequestException('Journal entry has zero value');
    }

    const entryNumber = await this.numbering.next(opts.companyId, 'JOURNAL', opts.tx);

    const entry = await (db as any).journalEntry.create({
      data: {
        companyId: opts.companyId,
        entryNumber,
        entryDate: date,
        fiscalPeriodId,
        memo: opts.memo,
        status: 'POSTED',
        sourceType: opts.sourceType ?? 'MANUAL',
        sourceId: opts.sourceId,
        postedByUserId: opts.postedByUserId,
        postedAt: new Date(),
        totalDebit: totalDebit.toDecimalPlaces(4).toString(),
        totalCredit: totalCredit.toDecimalPlaces(4).toString(),
        lines: {
          create: opts.lines.map((line, idx) => ({
            lineNo: idx + 1,
            accountId: line.accountId,
            debit: new Decimal(line.debit ?? 0).toDecimalPlaces(4).toString(),
            credit: new Decimal(line.credit ?? 0).toDecimalPlaces(4).toString(),
            description: line.description,
            currencyCode: line.currencyCode ?? 'USD',
            exchangeRate: new Decimal(line.exchangeRate ?? 1).toString(),
            customerId: line.customerId,
            supplierId: line.supplierId,
            productionJobId: line.productionJobId,
            orderId: line.orderId,
          })),
        },
      },
      select: { id: true },
    });

    return entry.id;
  }

  async findAll(companyId: string, filter: JournalFilterDto) {
    const { fromDate, toDate, status, page = 1, limit = 20 } = filter;
    const where: any = { companyId };
    if (status) where.status = status;
    if (fromDate || toDate) {
      where.entryDate = {};
      if (fromDate) where.entryDate.gte = new Date(fromDate);
      if (toDate) where.entryDate.lte = new Date(toDate);
    }

    const [data, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        include: { lines: { include: { account: { select: { code: true, name: true } } } } },
        orderBy: { entryDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async findOne(companyId: string, id: string) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, companyId },
      include: {
        lines: { include: { account: true } },
        fiscalPeriod: true,
      },
    });
    if (!entry) throw new NotFoundException('Journal entry not found');
    return entry;
  }

  async createManual(companyId: string, dto: CreateJournalEntryDto, userId: string) {
    return this.createAndPost({
      companyId,
      sourceType: 'MANUAL',
      memo: dto.memo,
      entryDate: dto.entryDate ? new Date(dto.entryDate) : undefined,
      lines: dto.lines,
      postedByUserId: userId,
    });
  }

  async reverse(companyId: string, id: string, userId: string) {
    const entry = await this.findOne(companyId, id);
    if (entry.status !== 'POSTED') {
      throw new BadRequestException('Only POSTED entries can be reversed');
    }
    if (entry.reversedByEntryId) {
      throw new BadRequestException('Entry is already reversed');
    }

    const reversalId = await this.createAndPost({
      companyId,
      sourceType: 'REVERSAL',
      sourceId: entry.id,
      memo: `Reversal of ${entry.entryNumber}`,
      lines: entry.lines.map((line) => ({
        accountId: line.accountId,
        debit: new Decimal(line.credit.toString()),
        credit: new Decimal(line.debit.toString()),
        description: line.description ?? undefined,
        customerId: line.customerId ?? undefined,
        supplierId: line.supplierId ?? undefined,
        productionJobId: line.productionJobId ?? undefined,
        orderId: line.orderId ?? undefined,
      })),
      postedByUserId: userId,
    });

    await this.prisma.journalEntry.update({
      where: { id },
      data: { status: 'REVERSED', reversedByEntryId: reversalId },
    });

    return { reversalId };
  }

}
