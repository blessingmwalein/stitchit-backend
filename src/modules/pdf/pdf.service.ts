import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';

// Puppeteer is loaded lazily to avoid startup crash when chromium isn't present
let puppeteer: typeof import('puppeteer') | null = null;

async function getPuppeteer() {
  if (!puppeteer) {
    puppeteer = await import('puppeteer');
  }
  return puppeteer;
}

@Injectable()
export class PdfService implements OnModuleDestroy {
  private readonly log = new Logger(PdfService.name);
  private browser: import('puppeteer').Browser | null = null;
  private readonly templatesDir: string;
  private readonly compiledCache = new Map<string, HandlebarsTemplateDelegate>();

  constructor(private readonly config: ConfigService) {
    this.templatesDir = path.join(__dirname, 'templates');
    this.registerHelpers();
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private registerHelpers() {
    Handlebars.registerHelper('formatMoney', (val: any) => {
      const n = parseFloat(String(val ?? 0));
      return isNaN(n) ? '0.00' : n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    });

    Handlebars.registerHelper('formatDate', (val: any) => {
      if (!val) return '';
      const d = new Date(val);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    });

    Handlebars.registerHelper('lineNo', (val: any) => String(val).padStart(2, '0'));

    Handlebars.registerHelper('statusBadge', (status: string) => {
      const colours: Record<string, string> = {
        DRAFT: '#94a3b8', SENT: '#3b82f6', APPROVED: '#22c55e',
        REJECTED: '#ef4444', EXPIRED: '#f97316',
        AWAITING_DEPOSIT: '#f59e0b', DEPOSIT_PAID: '#10b981',
        IN_PRODUCTION: '#8b5cf6', QUALITY_CHECK: '#ec4899',
        READY: '#14b8a6', DELIVERED: '#22c55e', CLOSED: '#64748b',
      };
      const bg = colours[status] ?? '#94a3b8';
      return new Handlebars.SafeString(
        `<span style="background:${bg};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">${status.replace(/_/g, ' ')}</span>`,
      );
    });

    Handlebars.registerHelper('eq', (a: any, b: any) => a === b);
    Handlebars.registerHelper('mul', (a: any, b: any) => parseFloat(a) * parseFloat(b));
  }

  private async getBrowser() {
    if (this.browser) return this.browser;
    const p = await getPuppeteer();
    this.browser = await p.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      executablePath: this.config.get<string>('pdf.chromiumPath') || undefined,
    });
    return this.browser;
  }

  private getTemplate(name: string): HandlebarsTemplateDelegate {
    if (this.compiledCache.has(name)) return this.compiledCache.get(name)!;
    const filePath = path.join(this.templatesDir, `${name}.hbs`);
    const src = fs.readFileSync(filePath, 'utf8');
    const compiled = Handlebars.compile(src);
    this.compiledCache.set(name, compiled);
    return compiled;
  }

  async renderHtml(templateName: string, context: Record<string, any>): Promise<string> {
    const tpl = this.getTemplate(templateName);
    return tpl(context);
  }

  async generatePdf(templateName: string, context: Record<string, any>): Promise<Buffer> {
    const html = await this.renderHtml(templateName, context);
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  async generateQrDataUri(text: string): Promise<string> {
    return QRCode.toDataURL(text, { width: 120, margin: 1 });
  }
}
