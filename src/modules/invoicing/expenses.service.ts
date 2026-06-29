import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PostingService } from '../accounting/posting.service';
import { NumberingService } from '../documents/numbering.service';
import { CreateExpenseDto } from './dto/invoicing.dto';
import Decimal from 'decimal.js';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: PostingService,
    private readonly numbering: NumberingService,
  ) {}

  async findAll(companyId: string, page = 1, limit = 20) {
    const where = { companyId };
    const [data, total] = await Promise.all([
      this.prisma.expenseEntry.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.expenseEntry.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async findOne(companyId: string, id: string) {
    const e = await this.prisma.expenseEntry.findFirst({ where: { id, companyId } });
    if (!e) throw new NotFoundException('Expense not found');
    return e;
  }

  async update(
    companyId: string,
    id: string,
    dto: { description?: string; payee?: string; category?: string },
  ) {
    const expense = await this.prisma.expenseEntry.findFirst({ where: { id, companyId } });
    if (!expense) throw new NotFoundException('Expense not found');
    return this.prisma.expenseEntry.update({ where: { id }, data: dto });
  }

  async remove(companyId: string, id: string) {
    const expense = await this.prisma.expenseEntry.findFirst({ where: { id, companyId } });
    if (!expense) throw new NotFoundException('Expense not found');
    return this.prisma.$transaction(async (tx) => {
      if (expense.journalEntryId) {
        await tx.journalEntry.update({
          where: { id: expense.journalEntryId },
          data: { status: 'REVERSED' },
        });
      }
      await tx.expenseEntry.delete({ where: { id } });
    });
  }

  async create(companyId: string, dto: CreateExpenseDto, userId: string) {
    const date = new Date(dto.date);
    const amount = new Decimal(dto.amount);

    return this.prisma.$transaction(async (tx) => {
      const expenseNumber = await this.numbering.next(companyId, 'EXPENSE', tx);

      const expense = await tx.expenseEntry.create({
        data: {
          companyId,
          expenseNumber,
          date,
          expenseAccountId: dto.expenseAccountId,
          paidFromAccountId: dto.paidFromAccountId,
          amount: amount.toString(),
          currencyCode: dto.currencyCode ?? 'USD',
          exchangeRate: dto.exchangeRate ?? 1,
          payee: dto.payee,
          category: dto.category,
          description: dto.description,
          createdByUserId: userId,
        },
      });

      const memo = dto.description
        ?? (dto.payee ? `${dto.category ?? 'Expense'} — ${dto.payee}` : undefined);

      const jeId = await this.posting.postExpense({
        companyId,
        expenseId: expense.id,
        expenseAccountId: dto.expenseAccountId,
        paidFromAccountId: dto.paidFromAccountId,
        amount,
        date,
        userId,
        memo,
        tx,
      });

      return tx.expenseEntry.update({
        where: { id: expense.id },
        data: { journalEntryId: jeId },
      });
    });
  }

}
