import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SendWhatsAppDto } from './dto/whatsapp.dto';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get baseUrl() {
    const phoneId = this.config.get<string>('whatsapp.phoneNumberId');
    return `https://graph.facebook.com/v20.0/${phoneId}/messages`;
  }

  private get accessToken() {
    return this.config.get<string>('whatsapp.accessToken');
  }

  private get verifyToken() {
    return this.config.get<string>('whatsapp.verifyToken');
  }

  async send(companyId: string, dto: SendWhatsAppDto): Promise<any> {
    const body = {
      messaging_product: 'whatsapp',
      to: dto.toNumber,
      type: 'text',
      text: { body: dto.message },
    };

    let waMessageId: string | null = null;
    let error: string | null = null;

    try {
      const res = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as any;
      if (!res.ok) {
        error = json?.error?.message ?? 'Unknown error';
      } else {
        waMessageId = json?.messages?.[0]?.id ?? null;
      }
    } catch (e: any) {
      error = e.message;
      this.logger.error('WhatsApp send failed', e.message);
    }

    return this.prisma.whatsAppMessage.create({
      data: {
        companyId,
        direction: 'OUTBOUND',
        waMessageId,
        toNumber: dto.toNumber,
        customerId: dto.customerId,
        leadId: dto.leadId,
        templateName: dto.templateName,
        type: 'TEXT',
        body: { text: dto.message },
        status: error ? 'FAILED' : 'SENT',
        error,
        relatedType: dto.relatedType,
        relatedId: dto.relatedId,
      },
    });
  }

  async sendTemplate(companyId: string, opts: {
    toNumber: string;
    templateName: string;
    languageCode?: string;
    components?: any[];
    customerId?: string;
    leadId?: string;
    relatedType?: string;
    relatedId?: string;
  }) {
    const body = {
      messaging_product: 'whatsapp',
      to: opts.toNumber,
      type: 'template',
      template: {
        name: opts.templateName,
        language: { code: opts.languageCode ?? 'en_US' },
        components: opts.components ?? [],
      },
    };

    let waMessageId: string | null = null;
    let error: string | null = null;

    try {
      const res = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as any;
      if (!res.ok) {
        error = json?.error?.message ?? 'Unknown error';
      } else {
        waMessageId = json?.messages?.[0]?.id ?? null;
      }
    } catch (e: any) {
      error = e.message;
    }

    return this.prisma.whatsAppMessage.create({
      data: {
        companyId,
        direction: 'OUTBOUND',
        waMessageId,
        toNumber: opts.toNumber,
        customerId: opts.customerId,
        leadId: opts.leadId,
        templateName: opts.templateName,
        type: 'TEMPLATE',
        body: body.template,
        status: error ? 'FAILED' : 'SENT',
        error,
        relatedType: opts.relatedType,
        relatedId: opts.relatedId,
      },
    });
  }

  /** Process inbound webhook payload from Meta */
  async processInbound(companyId: string, payload: any) {
    const entry = payload?.entry?.[0];
    const change = entry?.changes?.[0];
    const messages = change?.value?.messages ?? [];

    for (const msg of messages) {
      const from: string = msg.from;
      const waMessageId: string = msg.id;

      // Idempotency — skip if already logged
      const exists = await this.prisma.whatsAppMessage.findUnique({ where: { waMessageId } });
      if (exists) continue;

      // Try to find matching customer
      const customer = await this.prisma.customer.findFirst({
        where: { companyId, whatsappNumber: from },
      });
      const lead = !customer
        ? await this.prisma.lead.findFirst({ where: { companyId, whatsappNumber: from } })
        : null;

      const body = msg.type === 'text' ? msg.text : msg;

      await this.prisma.whatsAppMessage.create({
        data: {
          companyId,
          direction: 'INBOUND',
          waMessageId,
          fromNumber: from,
          customerId: customer?.id,
          leadId: lead?.id,
          type: (msg.type as string).toUpperCase(),
          body,
          status: 'DELIVERED',
        },
      });
    }

    // Process status updates
    const statuses = change?.value?.statuses ?? [];
    for (const s of statuses) {
      await this.prisma.whatsAppMessage.updateMany({
        where: { waMessageId: s.id },
        data: {
          status: s.status?.toUpperCase() === 'READ' ? 'READ'
            : s.status?.toUpperCase() === 'DELIVERED' ? 'DELIVERED'
            : s.status?.toUpperCase() === 'FAILED' ? 'FAILED'
            : 'SENT',
        },
      });
    }
  }

  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    if (mode === 'subscribe' && token === this.verifyToken) return challenge;
    return null;
  }

  async findMessages(companyId: string, customerId?: string, page = 1, limit = 30) {
    const where: any = { companyId };
    if (customerId) where.customerId = customerId;
    const [data, total] = await Promise.all([
      this.prisma.whatsAppMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.whatsAppMessage.count({ where }),
    ]);
    return { data, total, page, limit };
  }
}
