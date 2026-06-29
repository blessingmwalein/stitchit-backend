import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly log = new Logger(MailService.name);
  private transporter!: Transporter;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const cfg = this.config.get('mail') as {
      host: string; port: number; secure: boolean;
      user: string; pass: string; from: string;
    };

    this.transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
  }

  async sendMail(options: {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    attachments?: Array<{ filename: string; content?: Buffer; path?: string }>;
  }): Promise<void> {
    const from = this.config.get<string>('mail.from') ?? "Stitch't ERP <noreply@stitchit.co.zw>";
    try {
      await this.transporter.sendMail({ from, ...options });
      this.log.log(`Email sent to ${Array.isArray(options.to) ? options.to.join(', ') : options.to}: ${options.subject}`);
    } catch (err) {
      this.log.error(`Failed to send email: ${(err as Error).message}`);
      throw err;
    }
  }

  buildQuotationEmail(ctx: { customerName: string; quotationNumber: string; total: string; currency: string; portalLink?: string }): string {
    return `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;color:#1e293b;background:#f8fafc;margin:0;padding:0;">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
  <div style="background:#0f172a;padding:24px 28px;">
    <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px;">Stitch't</div>
    <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-top:2px;">Custom Tufted Rugs</div>
  </div>
  <div style="padding:28px;">
    <p style="font-size:15px;margin:0 0 16px;">Dear <strong>${ctx.customerName}</strong>,</p>
    <p style="color:#475569;line-height:1.7;margin:0 0 20px;">
      Thank you for your interest in Stitch't. Please find your quotation attached.
    </p>
    <div style="background:#f1f5f9;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
      <div style="font-size:12px;color:#64748b;margin-bottom:4px;">Quotation Number</div>
      <div style="font-size:20px;font-weight:700;color:#0f172a;">${ctx.quotationNumber}</div>
      <div style="font-size:16px;font-weight:600;color:#3b82f6;margin-top:8px;">${ctx.currency} ${ctx.total}</div>
    </div>
    ${ctx.portalLink ? `<a href="${ctx.portalLink}" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;">View &amp; Approve in Portal →</a>` : ''}
    <p style="color:#94a3b8;font-size:11px;margin-top:24px;">If you have any questions, please reply to this email or contact us on WhatsApp.</p>
  </div>
  <div style="background:#f8fafc;padding:16px 28px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;">
    © Stitch't Custom Tufted Rugs · Harare, Zimbabwe
  </div>
</div>
</body></html>`;
  }

  buildInvoiceEmail(ctx: { customerName: string; invoiceNumber: string; total: string; currency: string; dueDate?: string; portalLink?: string }): string {
    return `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;color:#1e293b;background:#f8fafc;margin:0;padding:0;">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
  <div style="background:#0f172a;padding:24px 28px;">
    <div style="font-size:22px;font-weight:800;color:#fff;">Stitch't</div>
    <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-top:2px;">Invoice</div>
  </div>
  <div style="padding:28px;">
    <p style="font-size:15px;margin:0 0 16px;">Dear <strong>${ctx.customerName}</strong>,</p>
    <p style="color:#475569;line-height:1.7;margin:0 0 20px;">Please find your invoice attached. Payment is appreciated promptly.</p>
    <div style="background:#fef3c7;border-left:3px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 18px;margin:0 0 20px;">
      <div style="font-size:12px;color:#92400e;margin-bottom:4px;">Invoice ${ctx.invoiceNumber}</div>
      <div style="font-size:20px;font-weight:700;color:#0f172a;">${ctx.currency} ${ctx.total}</div>
      ${ctx.dueDate ? `<div style="font-size:12px;color:#92400e;margin-top:6px;">Due: <strong>${ctx.dueDate}</strong></div>` : ''}
    </div>
    ${ctx.portalLink ? `<a href="${ctx.portalLink}" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;">Pay Now →</a>` : ''}
  </div>
  <div style="background:#f8fafc;padding:16px 28px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;">
    © Stitch't Custom Tufted Rugs · Harare, Zimbabwe
  </div>
</div>
</body></html>`;
  }

  buildOrderStatusEmail(ctx: { customerName: string; orderNumber: string; status: string; note?: string; portalLink?: string }): string {
    const statusColours: Record<string, string> = {
      IN_PRODUCTION: '#8b5cf6', QUALITY_CHECK: '#ec4899',
      READY: '#10b981', DELIVERED: '#22c55e',
    };
    const colour = statusColours[ctx.status] ?? '#3b82f6';
    return `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;color:#1e293b;background:#f8fafc;margin:0;padding:0;">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
  <div style="background:#0f172a;padding:24px 28px;">
    <div style="font-size:22px;font-weight:800;color:#fff;">Stitch't</div>
    <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-top:2px;">Order Update</div>
  </div>
  <div style="padding:28px;">
    <p style="font-size:15px;margin:0 0 16px;">Dear <strong>${ctx.customerName}</strong>,</p>
    <p style="color:#475569;line-height:1.7;margin:0 0 20px;">Your order status has been updated.</p>
    <div style="background:#f1f5f9;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
      <div style="font-size:12px;color:#64748b;">Order <strong>${ctx.orderNumber}</strong></div>
      <div style="margin-top:8px;"><span style="background:${colour};color:#fff;padding:4px 12px;border-radius:4px;font-size:13px;font-weight:600;">${ctx.status.replace(/_/g, ' ')}</span></div>
      ${ctx.note ? `<div style="font-size:12px;color:#475569;margin-top:10px;">${ctx.note}</div>` : ''}
    </div>
    ${ctx.portalLink ? `<a href="${ctx.portalLink}" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;">Track Order →</a>` : ''}
  </div>
  <div style="background:#f8fafc;padding:16px 28px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;">
    © Stitch't Custom Tufted Rugs · Harare, Zimbabwe
  </div>
</div>
</body></html>`;
  }
}
