import { Prisma } from '@prisma/client';

export type DecimalInput = Prisma.Decimal | number | string;

export const D = (value: DecimalInput): Prisma.Decimal => new Prisma.Decimal(value);

export const ZERO = new Prisma.Decimal(0);

export function sum(values: DecimalInput[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((acc, v) => acc.plus(D(v)), ZERO);
}

export function money(value: DecimalInput): Prisma.Decimal {
  return D(value).toDecimalPlaces(4);
}

/** Convert a dimension to centimetres. */
export function toCm(value: number, unit: 'CM' | 'M' | 'IN' | 'FT'): number {
  switch (unit) {
    case 'CM':
      return value;
    case 'M':
      return value * 100;
    case 'IN':
      return value * 2.54;
    case 'FT':
      return value * 30.48;
  }
}
