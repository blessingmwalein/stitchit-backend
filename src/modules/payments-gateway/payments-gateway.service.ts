import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from '../invoicing/payments.service';

@Injectable()
export class PaymentsGatewayService {
  private readonly logger = new Logger(PaymentsGatewayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly paymentsService: PaymentsService,
  ) {}

  // ── Paynow Zimbabwe ────────────────────────────────────────────────────────

  async initiatePaynow(opts: {
    companyId: string;
    customerId: string;
    orderId?: string;
    invoiceId?: string;
    amount: number;
    email: string;
    reference: string;
    isDeposit?: boolean;
  }) {
    const paynowIntegrationId = this.config.get<string>('paynow.integrationId');
    const paynowIntegrationKey = this.config.get<string>('paynow.integrationKey');
    const returnUrl = this.config.get<string>('paynow.returnUrl') ?? `${this.config.get('app.url')}/payment/return`;
    const resultUrl = this.config.get<string>('paynow.resultUrl') ?? `${this.config.get('app.url')}/api/v1/payments-gateway/paynow/webhook`;

    if (!paynowIntegrationId || !paynowIntegrationKey) {
      throw new BadRequestException('Paynow not configured');
    }

    // Build Paynow request per their API spec
    const fields: Record<string, string> = {
      id: paynowIntegrationId,
      reference: opts.reference,
      amount: opts.amount.toFixed(2),
      additionalinfo: `Payment for ${opts.reference}`,
      authemail: opts.email,
      returnurl: returnUrl,
      resulturl: resultUrl,
      status: 'Message',
    };

    const hash = this.paynowHash(fields, paynowIntegrationKey);
    const body = new URLSearchParams({ ...fields, hash }).toString();

    const res = await fetch('https://www.paynow.co.zw/interface/initiatetransaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const text = await res.text();
    const params = new URLSearchParams(text);
    const status = params.get('status')?.toLowerCase();

    if (status !== 'ok') {
      throw new BadRequestException(`Paynow error: ${params.get('error') ?? status}`);
    }

    return {
      redirectUrl: params.get('browserurl'),
      pollUrl: params.get('pollurl'),
    };
  }

  async handlePaynowWebhook(companyId: string, body: Record<string, string>) {
    const { reference, status, paynowreference, amount } = body;
    if (status?.toLowerCase() !== 'paid') return;

    // Find the pending payment by reference or create it
    const existingPayment = await this.prisma.payment.findFirst({
      where: { companyId, reference },
    });
    if (existingPayment?.gatewayStatus === 'PAID') return; // idempotent

    if (existingPayment) {
      await this.prisma.payment.update({
        where: { id: existingPayment.id },
        data: { gatewayStatus: 'PAID', gatewayRef: paynowreference },
      });
    }
  }

  private paynowHash(fields: Record<string, string>, key: string): string {
    const values = Object.values(fields).join('') + key;
    // Paynow uses SHA-512
    const { createHash } = require('crypto');
    return createHash('sha512').update(values).digest('hex').toUpperCase();
  }
}
