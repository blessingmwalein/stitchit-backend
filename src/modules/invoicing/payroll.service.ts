import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PostingService } from '../accounting/posting.service';
import { CreatePayrollRunDto } from './dto/invoicing.dto';
import Decimal from 'decimal.js';

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: PostingService,
  ) {}

  async findAll(companyId: string) {
    return this.prisma.payrollRun.findMany({
      where: { companyId },
      include: { lines: true },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    });
  }

  async findOne(companyId: string, id: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id, companyId },
      include: { lines: true },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }

  async create(companyId: string, dto: CreatePayrollRunDto, userId: string) {
    const existing = await this.prisma.payrollRun.findFirst({
      where: { companyId, periodYear: dto.periodYear, periodMonth: dto.periodMonth },
    });
    if (existing) {
      throw new BadRequestException(
        `Payroll for ${dto.periodYear}/${String(dto.periodMonth).padStart(2, '0')} already exists`,
      );
    }

    const totalGross = dto.lines.reduce((s, l) => s.plus(new Decimal(l.gross)), new Decimal(0));
    const totalDeductions = dto.lines.reduce(
      (s, l) => s.plus(new Decimal(l.deductions ?? 0)),
      new Decimal(0),
    );
    const totalNet = totalGross.minus(totalDeductions);

    return this.prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.create({
        data: {
          companyId,
          periodYear: dto.periodYear,
          periodMonth: dto.periodMonth,
          totalGross: totalGross.toString(),
          totalDeductions: totalDeductions.toString(),
          totalNet: totalNet.toString(),
          notes: dto.notes,
          createdByUserId: userId,
          lines: {
            create: dto.lines.map((l) => ({
              userId: l.userId,
              staffName: l.staffName,
              gross: new Decimal(l.gross).toString(),
              deductions: new Decimal(l.deductions ?? 0).toString(),
              net: new Decimal(l.gross).minus(new Decimal(l.deductions ?? 0)).toString(),
            })),
          },
        },
        include: { lines: true },
      });

      // Last day of the payroll month
      const payDate = new Date(dto.periodYear, dto.periodMonth - 1 + 1, 0);
      const jeId = await this.posting.postPayroll({
        companyId,
        payrollRunId: run.id,
        gross: totalGross,
        deductions: totalDeductions,
        net: totalNet,
        date: payDate,
        userId,
        tx,
      });

      return tx.payrollRun.update({
        where: { id: run.id },
        data: { journalEntryId: jeId },
        include: { lines: true },
      });
    });
  }
}
