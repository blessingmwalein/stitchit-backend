import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PriceCalculateDto } from './dto/costing.dto';
import Decimal from 'decimal.js';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async calculate(companyId: string, dto: PriceCalculateDto) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { companyId_key: { companyId, key: 'pricing' } },
    });

    const params = (setting?.value ?? {}) as Record<string, any>;
    const pricePerSqCm = new Decimal(params.pricePerSqCm ?? 0.012);
    const complexityFactors: Record<string, number> = params.complexityFactors ?? {
      SIMPLE: 1.0, MEDIUM: 1.2, COMPLEX: 1.5, VERY_COMPLEX: 2.0,
    };
    const shapeFactors: Record<string, number> = params.shapeFactors ?? {
      RECTANGLE: 1.0, SQUARE: 1.0, CIRCLE: 1.15, OVAL: 1.2,
      RUNNER: 1.05, IRREGULAR: 1.35, CUSTOM: 1.4,
    };
    const rushFactor = new Decimal(params.rushFactor ?? 1.25);

    const areaSqCm = new Decimal(dto.widthCm).mul(dto.heightCm);
    const complexityFactor = new Decimal(complexityFactors[dto.complexity] ?? 1.0);
    const shapeFactor = new Decimal(shapeFactors[dto.shape] ?? 1.0);

    let price = areaSqCm.mul(pricePerSqCm).mul(complexityFactor).mul(shapeFactor);
    if (dto.isRush) price = price.mul(rushFactor);

    return {
      widthCm: dto.widthCm,
      heightCm: dto.heightCm,
      areaSqCm: areaSqCm.toFixed(2),
      complexity: dto.complexity,
      shape: dto.shape,
      isRush: dto.isRush ?? false,
      pricePerSqCm: pricePerSqCm.toFixed(4),
      complexityFactor: complexityFactor.toFixed(4),
      shapeFactor: shapeFactor.toFixed(4),
      rushFactor: dto.isRush ? rushFactor.toFixed(4) : '1.0000',
      suggestedPrice: price.toDecimalPlaces(2).toFixed(2),
      aiFactors: { areaSqCm, complexityFactor, shapeFactor, rushFactor: dto.isRush ? rushFactor : new Decimal(1) },
    };
  }

  async getSettings(companyId: string) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { companyId_key: { companyId, key: 'pricing' } },
    });
    return setting?.value ?? {};
  }

  async updateSettings(companyId: string, value: Record<string, any>) {
    return this.prisma.systemSetting.upsert({
      where: { companyId_key: { companyId, key: 'pricing' } },
      create: { companyId, key: 'pricing', value },
      update: { value },
    });
  }
}
