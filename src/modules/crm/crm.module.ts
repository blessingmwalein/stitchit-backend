import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { CustomersService } from './customers.service';
import { CommunicationsService } from './communications.service';
import { FollowUpsService } from './follow-ups.service';
import {
  LeadsController,
  CustomersController,
  CommunicationsController,
  FollowUpsController,
} from './crm.controller';

@Module({
  controllers: [LeadsController, CustomersController, CommunicationsController, FollowUpsController],
  providers: [LeadsService, CustomersService, CommunicationsService, FollowUpsService],
  exports: [LeadsService, CustomersService, CommunicationsService, FollowUpsService],
})
export class CrmModule {}
