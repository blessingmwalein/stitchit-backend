import { Controller, Post, Get, Body, Query, Request } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';
import { PricingService } from '../costing/pricing.service';
import { Public } from '../../common/decorators/public.decorator';
import { CreatePublicLeadDto, PublicPriceDto } from './dto/public.dto';
import { ComplexityLevel, ShapeType } from '../costing/dto/costing.dto';

@Controller('public')
@Public()
export class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  /** Website contact form → creates a Lead */
  @Post('leads')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async createLead(@Body() dto: CreatePublicLeadDto, @Request() req: any) {
    // Look up the single company
    const company = await this.prisma.company.findFirst({ where: { isActive: true } });
    if (!company) return { message: 'Thank you, we will be in touch.' };

    const companyId = company.id;
    const count = await this.prisma.lead.count({ where: { companyId } });
    const leadNumber = `LEAD-${String(count + 1).padStart(5, '0')}`;

    await this.prisma.lead.create({
      data: {
        companyId,
        leadNumber,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        whatsappNumber: dto.whatsappNumber,
        source: (dto.source as any) ?? 'WEBSITE',
        notes: dto.message,
        stage: 'NEW_LEAD',
      },
    });

    return { message: 'Thank you, we will be in touch shortly.' };
  }

  /** Public pricing estimate (no auth) */
  @Get('pricing/estimate')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async pricingEstimate(@Query() dto: PublicPriceDto) {
    const company = await this.prisma.company.findFirst({ where: { isActive: true } });
    if (!company) return { error: 'Service unavailable' };

    return this.pricing.calculate(company.id, {
      widthCm: dto.widthCm,
      heightCm: dto.heightCm,
      complexity: (dto.complexity as ComplexityLevel) ?? ComplexityLevel.SIMPLE,
      shape: (dto.shape as ShapeType) ?? ShapeType.RECTANGLE,
      isRush: dto.isRush === 'true',
    });
  }
}
