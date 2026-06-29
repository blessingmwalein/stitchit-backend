import { Body, Controller, Get, Param, Patch, Put } from '@nestjs/common';
import { CompanyService } from './company.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Audited } from '../../common/decorators/audit.decorator';

@Controller('settings')
export class CompanyController {
  constructor(private readonly company: CompanyService) {}

  @Get('company')
  @RequirePermissions('settings.view')
  getCompany(@CurrentUser() user: AuthUser) {
    return this.company.get(user.companyId);
  }

  @Patch('company')
  @RequirePermissions('settings.update')
  @Audited('settings.company_update', 'Company')
  updateCompany(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    const allowed = ['name', 'legalName', 'taxId', 'address', 'city', 'country', 'phone', 'whatsapp', 'email', 'website', 'logoFileId'];
    const data = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
    return this.company.update(user.companyId, data);
  }

  @Get('branches')
  @RequirePermissions('settings.view')
  branches(@CurrentUser() user: AuthUser) {
    return this.company.listBranches(user.companyId);
  }

  @Get('all')
  @RequirePermissions('settings.view')
  settings(@CurrentUser() user: AuthUser) {
    return this.company.listSettings(user.companyId);
  }

  @Get('sequences')
  @RequirePermissions('settings.view')
  sequences(@CurrentUser() user: AuthUser) {
    return this.company.listSequences(user.companyId);
  }

  @Patch('sequences/:docType')
  @RequirePermissions('settings.update')
  @Audited('settings.sequence_update', 'NumberSequence')
  updateSequence(
    @CurrentUser() user: AuthUser,
    @Param('docType') docType: string,
    @Body() body: { prefix?: string; padLength?: number; yearlyReset?: boolean },
  ) {
    return this.company.updateSequence(user.companyId, docType, body);
  }

  @Get(':key')
  @RequirePermissions('settings.view')
  getSetting(@CurrentUser() user: AuthUser, @Param('key') key: string) {
    return this.company.getSetting(user.companyId, key);
  }

  @Put(':key')
  @RequirePermissions('settings.update')
  @Audited('settings.update', 'SystemSetting')
  setSetting(@CurrentUser() user: AuthUser, @Param('key') key: string, @Body() body: unknown) {
    return this.company.setSetting(user.companyId, key, body);
  }
}
