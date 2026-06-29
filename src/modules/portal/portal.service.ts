import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { PortalUpdateProfileDto, ApproveQuoteDto, RejectQuoteDto } from './dto/portal.dto';

@Injectable()
export class PortalService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Profile ───────────────────────────────────────────────────────────────

  async getProfile(customerId: string) {
    const customer = await this.prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: {
        id: true, customerNumber: true, type: true,
        firstName: true, lastName: true, companyName: true,
        email: true, phone: true, address: true, city: true, country: true,
        avatarUrl: true, portalEnabled: true, createdAt: true,
      },
    });
    return customer;
  }

  async updateProfile(customerId: string, dto: PortalUpdateProfileDto) {
    return this.prisma.customer.update({
      where: { id: customerId },
      data: dto,
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true, address: true,
      },
    });
  }

  async changePassword(customerId: string, currentPassword: string, newPassword: string) {
    const customer = await this.prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { passwordHash: true },
    });
    if (!customer.passwordHash) throw new BadRequestException('No password set');
    const valid = await bcrypt.compare(currentPassword, customer.passwordHash);
    if (!valid) throw new BadRequestException('Current password is incorrect');
    const hash = await bcrypt.hash(newPassword, 12);
    await this.prisma.customer.update({ where: { id: customerId }, data: { passwordHash: hash } });
    return { message: 'Password changed' };
  }

  // ── Quotations ────────────────────────────────────────────────────────────

  async listQuotes(customerId: string, page = 1, limit = 10) {
    const where = { customerId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.quotation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { items: true },
      }),
      this.prisma.quotation.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async getQuote(customerId: string, id: string) {
    const q = await this.prisma.quotation.findFirst({
      where: { id, customerId },
      include: { items: true },
    });
    if (!q) throw new NotFoundException('Quote not found');
    return q;
  }

  async approveQuote(customerId: string, id: string, dto: ApproveQuoteDto) {
    const q = await this.getQuote(customerId, id);
    if (q.status !== 'SENT') throw new BadRequestException('Quote cannot be approved in current status');
    return this.prisma.quotation.update({
      where: { id },
      data: { status: 'APPROVED', notes: dto.notes ? `${q.notes ?? ''}\nCustomer: ${dto.notes}` : q.notes },
    });
  }

  async rejectQuote(customerId: string, id: string, dto: RejectQuoteDto) {
    const q = await this.getQuote(customerId, id);
    if (q.status !== 'SENT') throw new BadRequestException('Quote cannot be rejected in current status');
    return this.prisma.quotation.update({
      where: { id },
      data: { status: 'REJECTED', notes: dto.reason ? `${q.notes ?? ''}\nRejected: ${dto.reason}` : q.notes },
    });
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(customerId: string, page = 1, limit = 10) {
    const where = { customerId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          items: { select: { id: true, rugName: true, widthCm: true, heightCm: true, quantity: true, unitPrice: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async getOrder(customerId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, customerId },
      include: {
        items: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        productionJobs: {
          include: {
            stages: {
              include: { stageDef: true },
              orderBy: { sequence: 'asc' },
            },
          },
        },
        attachments: { select: { id: true, fileId: true, label: true, kind: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  // ── Documents ─────────────────────────────────────────────────────────────

  async getOrderDocuments(customerId: string, orderId: string) {
    await this.getOrder(customerId, orderId); // ownership check
    // Find invoices for this order to include their documents too
    const invoices = await this.prisma.invoice.findMany({
      where: { orderId },
      select: { id: true },
    });
    const invoiceIds = invoices.map((i) => i.id);
    return this.prisma.generatedDocument.findMany({
      where: {
        OR: [
          { entityId: orderId },
          ...(invoiceIds.length ? [{ entityId: { in: invoiceIds } }] : []),
        ],
      },
    });
  }

  // ── Payments ──────────────────────────────────────────────────────────────

  async listPayments(customerId: string, page = 1, limit = 10) {
    const where = { customerId };
    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { paymentDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { allocations: { include: { invoice: { select: { invoiceNumber: true } } } } },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async listInvoices(customerId: string, page = 1, limit = 10) {
    const where = { customerId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: { issueDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { items: true },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  // ── Notifications ─────────────────────────────────────────────────────────

  async listNotifications(userId: string, page = 1, limit = 20) {
    const where = { userId };
    const [data, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { data, total, unread, page, limit };
  }

  async markNotificationRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllNotificationsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
