import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../documents/numbering.service';
import { AuditService } from '../audit/audit.service';
import { DocType } from '@prisma/client';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  EnablePortalDto,
  CustomerFilterDto,
} from './dto/crm.dto';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
  ) {}

  async create(companyId: string, dto: CreateCustomerDto, userId?: string) {
    if (dto.email) {
      const exists = await this.prisma.customer.findFirst({ where: { companyId, email: dto.email, deletedAt: null } });
      if (exists) throw new ConflictException('A customer with this email already exists');
    }

    const customerNumber = await this.numbering.next(companyId, DocType.CUSTOMER);
    const customer = await this.prisma.customer.create({
      data: {
        companyId,
        customerNumber,
        type: dto.type,
        firstName: dto.firstName,
        lastName: dto.lastName,
        companyName: dto.companyName,
        contactPerson: dto.contactPerson,
        email: dto.email,
        phone: dto.phone,
        whatsappNumber: dto.whatsappNumber,
        address: dto.address,
        city: dto.city,
        country: dto.country ?? 'Zimbabwe',
        taxId: dto.taxId,
        notes: dto.notes,
        creditLimit: dto.creditLimit,
      },
    });

    await this.audit.log({ companyId, userId, action: 'customers.create', entityType: 'Customer', entityId: customer.id, newValue: customer });
    return customer;
  }

  async findAll(companyId: string, filter: CustomerFilterDto, pagination: PaginationDto) {
    const where = {
      companyId,
      deletedAt: null,
      ...(filter.type && { type: filter.type }),
      ...(filter.portalEnabled !== undefined && { portalEnabled: filter.portalEnabled }),
      ...(filter.search && {
        OR: [
          { firstName: { contains: filter.search, mode: 'insensitive' as const } },
          { lastName: { contains: filter.search, mode: 'insensitive' as const } },
          { companyName: { contains: filter.search, mode: 'insensitive' as const } },
          { email: { contains: filter.search, mode: 'insensitive' as const } },
          { phone: { contains: filter.search, mode: 'insensitive' as const } },
          { customerNumber: { contains: filter.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        select: {
          id: true, companyId: true, customerNumber: true, type: true,
          firstName: true, lastName: true, companyName: true, email: true,
          phone: true, whatsappNumber: true, city: true, country: true,
          portalEnabled: true, isActive: true, createdAt: true,
          _count: { select: { orders: true, invoices: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  async findOne(companyId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        leads: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 5 },
        orders: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 10,
          select: { id: true, orderNumber: true, status: true, total: true, createdAt: true } },
        quotations: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 5,
          select: { id: true, quotationNumber: true, status: true, total: true, createdAt: true } },
        communications: { orderBy: { createdAt: 'desc' }, take: 10 },
        followUps: { where: { status: 'PENDING' }, orderBy: { dueAt: 'asc' }, take: 5 },
        _count: { select: { orders: true, invoices: true, payments: true } },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    // never expose passwordHash
    const { passwordHash: _, ...safe } = customer as any;
    return safe;
  }

  async update(companyId: string, id: string, dto: UpdateCustomerDto, userId?: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!customer) throw new NotFoundException('Customer not found');

    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.companyName !== undefined && { companyName: dto.companyName }),
        ...(dto.contactPerson !== undefined && { contactPerson: dto.contactPerson }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.whatsappNumber !== undefined && { whatsappNumber: dto.whatsappNumber }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.country !== undefined && { country: dto.country }),
        ...(dto.taxId !== undefined && { taxId: dto.taxId }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.creditLimit !== undefined && { creditLimit: dto.creditLimit }),
      },
    });

    const { passwordHash: _, ...safe } = updated as any;
    await this.audit.log({ companyId, userId, action: 'customers.update', entityType: 'Customer', entityId: id, oldValue: customer, newValue: updated });
    return safe;
  }

  async enablePortal(companyId: string, id: string, dto: EnablePortalDto, userId?: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (!customer.email) throw new ConflictException('Customer must have an email address to enable portal access');

    const hash = await bcrypt.hash(dto.password, 12);
    await this.prisma.customer.update({ where: { id }, data: { passwordHash: hash, portalEnabled: true } });
    await this.audit.log({ companyId, userId, action: 'customers.portal_enable', entityType: 'Customer', entityId: id });
    return { portalEnabled: true };
  }

  async disablePortal(companyId: string, id: string, userId?: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!customer) throw new NotFoundException('Customer not found');

    await this.prisma.customer.update({ where: { id }, data: { portalEnabled: false } });
    await this.audit.log({ companyId, userId, action: 'customers.portal_disable', entityType: 'Customer', entityId: id });
    return { portalEnabled: false };
  }

  async remove(companyId: string, id: string, userId?: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!customer) throw new NotFoundException('Customer not found');

    await this.prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ companyId, userId, action: 'customers.delete', entityType: 'Customer', entityId: id });
  }
}
