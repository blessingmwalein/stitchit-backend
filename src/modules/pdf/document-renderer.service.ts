import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MinioService } from '../storage/minio.service';
import { PdfService } from './pdf.service';
import { DocType } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';

const BASE_CSS_PATH = path.join(__dirname, 'templates', 'base.css');

function getBaseCSS(): string {
  try {
    return fs.readFileSync(BASE_CSS_PATH, 'utf8');
  } catch {
    return '';
  }
}

function buildCustomer(c: any) {
  if (!c) return { displayName: 'N/A', email: '', phone: '', address: '' };
  const displayName = c.type === 'CORPORATE'
    ? c.companyName ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()
    : `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.companyName;
  return { displayName, email: c.email ?? '', phone: c.phone ?? '', address: [c.address, c.city, c.country].filter(Boolean).join(', ') };
}

@Injectable()
export class DocumentRendererService {
  private readonly log = new Logger(DocumentRendererService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
    private readonly minio: MinioService,
    private readonly config: ConfigService,
  ) {}

  private get apiBase() {
    return this.config.get<string>('app.url') ?? 'http://localhost:3001/api/v1';
  }

  async renderQuotation(quotationId: string): Promise<{ buffer: Buffer; filename: string }> {
    const q = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        customer: true,
        items: { orderBy: { lineNo: 'asc' } },
      },
    });
    if (!q) throw new NotFoundException('Quotation not found');

    const company = await this.prisma.company.findUnique({ where: { id: q.companyId } });
    const qrDataUri = await this.pdf.generateQrDataUri(`${this.apiBase}/documents/verify/QT-${q.id}`);

    const context = {
      baseCSS: getBaseCSS(),
      quotationNumber: q.quotationNumber,
      status: q.status,
      isDraft: q.status === 'DRAFT',
      issueDate: q.issueDate,
      expiryDate: q.expiryDate,
      currencyCode: q.currencyCode,
      subtotal: q.subtotal,
      discountTotal: q.discountTotal,
      taxTotal: q.taxTotal,
      total: q.total,
      notes: q.notes,
      terms: q.terms,
      items: q.items,
      customer: buildCustomer(q.customer),
      company: { ...company, name: company?.name ?? "Stitch't" },
      qrDataUri,
      generatedAt: new Date(),
    };

    const buffer = await this.pdf.generatePdf('quotation', context);
    return { buffer, filename: `${q.quotationNumber}.pdf` };
  }

  async renderInvoice(invoiceId: string): Promise<{ buffer: Buffer; filename: string }> {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        items: { orderBy: { lineNo: 'asc' } },
        order: { select: { orderNumber: true } },
        allocations: { take: 20 },
      },
    });
    if (!inv) throw new NotFoundException('Invoice not found');

    const company = await this.prisma.company.findUnique({ where: { id: inv.companyId } });
    const qrDataUri = await this.pdf.generateQrDataUri(`${this.apiBase}/documents/verify/INV-${inv.id}`);

    const context = {
      baseCSS: getBaseCSS(),
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      isCreditNote: inv.type === 'CREDIT_NOTE',
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      currencyCode: inv.currencyCode,
      subtotal: inv.subtotal,
      discountTotal: inv.discountTotal,
      taxTotal: inv.taxTotal,
      taxRate: '0',
      total: inv.total,
      amountPaid: inv.amountPaid,
      balance: inv.balance,
      notes: inv.notes,
      items: inv.items,
      customer: buildCustomer(inv.customer),
      company: { ...company, name: company?.name ?? "Stitch't" },
      orderNumber: inv.order?.orderNumber,
      paymentInstructions: 'Please pay via EcoCash / bank transfer / Paynow. Reference: ' + inv.invoiceNumber,
      qrDataUri,
      generatedAt: new Date(),
    };

    const buffer = await this.pdf.generatePdf('invoice', context);
    return { buffer, filename: `${inv.invoiceNumber}.pdf` };
  }

  async renderJobCard(jobId: string): Promise<{ buffer: Buffer; filename: string }> {
    const job = await this.prisma.productionJob.findUnique({
      where: { id: jobId },
      include: {
        order: { include: { customer: true, items: { orderBy: { lineNo: 'asc' } } } },
        stages: {
          include: {
            stageDef: true,
            assignedTo: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { stageDef: { sequence: 'asc' } },
        },
      },
    });
    if (!job) throw new NotFoundException('Production job not found');

    const company = await this.prisma.company.findUnique({ where: { id: job.companyId } });

    const context = {
      baseCSS: getBaseCSS(),
      jobNumber: job.jobNumber,
      orderNumber: job.order.orderNumber,
      priority: job.priority,
      promisedDate: job.order.promisedDate,
      customer: buildCustomer(job.order.customer),
      company: { ...company, name: company?.name ?? "Stitch't" },
      items: job.order.items,
      stages: job.stages,
      notes: job.notes,
      generatedAt: new Date(),
    };

    const buffer = await this.pdf.generatePdf('job-card', context);
    return { buffer, filename: `JC-${job.jobNumber}.pdf` };
  }

  async renderDeliveryNote(orderId: string): Promise<{ buffer: Buffer; filename: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, items: { orderBy: { lineNo: 'asc' } } },
    });
    if (!order) throw new NotFoundException('Order not found');

    const company = await this.prisma.company.findUnique({ where: { id: order.companyId } });
    const qrDataUri = await this.pdf.generateQrDataUri(`${this.apiBase}/documents/verify/DN-${order.id}`);
    const seq = await this.prisma.numberSequence.findFirst({ where: { companyId: order.companyId, docType: 'DELIVERY_NOTE' } });

    const context = {
      baseCSS: getBaseCSS(),
      docNumber: `DN-${order.orderNumber}`,
      orderNumber: order.orderNumber,
      deliveryDate: order.deliveredAt ?? new Date(),
      deliveryAddress: order.deliveryAddress,
      customer: buildCustomer(order.customer),
      company: { ...company, name: company?.name ?? "Stitch't" },
      items: order.items,
      notes: order.notes,
      qrDataUri,
      generatedAt: new Date(),
    };

    const buffer = await this.pdf.generatePdf('delivery-note', context);
    return { buffer, filename: `DN-${order.orderNumber}.pdf` };
  }

  async saveToMinio(companyId: string, buffer: Buffer, filename: string, docType: DocType, docId: string): Promise<string> {
    const bucket = 'documents';
    const objectKey = `${companyId}/${docType.toLowerCase()}/${docId}/${filename}`;
    await this.minio.putObject(bucket, objectKey, buffer, 'application/pdf');
    return objectKey;
  }
}
