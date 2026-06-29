import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ProductionService } from './production.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  CreateJobsFromOrderDto, UpdateJobDto, JobFilterDto,
  AssignStageDto, CompleteStageDto, LogStageEventDto, AddStageImageDto,
  PlanAllocationDto, IssueAllocationDto, RecordWasteDto,
} from './dto/production.dto';

@Controller('production/jobs')
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  // ── Jobs ──────────────────────────────────────────────────────────────────

  @Post()
  @RequirePermissions('production.jobs.create')
  createFromOrder(@CurrentUser() user: AuthUser, @Body() dto: CreateJobsFromOrderDto) {
    return this.production.createJobsFromOrder(user.companyId, dto, user.sub);
  }

  @Get()
  @RequirePermissions('production.jobs.read')
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() filter: JobFilterDto,
    @Query() pagination: PaginationDto,
  ) {
    return this.production.findAll(user.companyId, filter, pagination);
  }

  @Get('kanban')
  @RequirePermissions('production.jobs.read')
  kanban(@CurrentUser() user: AuthUser) {
    return this.production.kanban(user.companyId);
  }

  @Get(':id')
  @RequirePermissions('production.jobs.read')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.production.findOne(user.companyId, id);
  }

  @Patch(':id')
  @RequirePermissions('production.jobs.update')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobDto,
  ) {
    return this.production.update(user.companyId, id, dto, user.sub);
  }

  @Post(':id/start')
  @RequirePermissions('production.jobs.update')
  start(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.production.startJob(user.companyId, id, user.sub);
  }

  @Post(':id/hold')
  @RequirePermissions('production.jobs.update')
  hold(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('note') note: string,
  ) {
    return this.production.holdJob(user.companyId, id, note, user.sub);
  }

  @Post(':id/cancel')
  @RequirePermissions('production.jobs.update')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.production.cancelJob(user.companyId, id, user.sub);
  }

  // ── Stages ────────────────────────────────────────────────────────────────

  @Post(':jobId/stages/:stageId/start')
  @RequirePermissions('production.stages.update')
  startStage(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
  ) {
    return this.production.startStage(user.companyId, jobId, stageId, user.sub);
  }

  @Post(':jobId/stages/:stageId/complete')
  @RequirePermissions('production.stages.update')
  completeStage(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @Body() dto: CompleteStageDto,
  ) {
    return this.production.completeStage(user.companyId, jobId, stageId, dto, user.sub);
  }

  @Post(':jobId/stages/:stageId/fail')
  @RequirePermissions('production.stages.update')
  failStage(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @Body('note') note: string,
  ) {
    return this.production.failStage(user.companyId, jobId, stageId, note, user.sub);
  }

  @Patch(':jobId/stages/:stageId/assign')
  @RequirePermissions('production.stages.update')
  assignStage(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @Body() dto: AssignStageDto,
  ) {
    return this.production.assignStage(user.companyId, jobId, stageId, dto, user.sub);
  }

  @Post(':jobId/stages/:stageId/log')
  @RequirePermissions('production.stages.update')
  addLog(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @Body() dto: LogStageEventDto,
  ) {
    return this.production.addLog(user.companyId, jobId, stageId, dto, user.sub);
  }

  @Post(':jobId/stages/:stageId/images')
  @RequirePermissions('production.stages.update')
  addImage(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @Body() dto: AddStageImageDto,
  ) {
    return this.production.addImage(user.companyId, jobId, stageId, dto, user.sub);
  }

  @Get(':jobId/stages/:stageId/images')
  @RequirePermissions('production.jobs.read')
  getImages(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
  ) {
    return this.production.getImages(user.companyId, jobId, stageId);
  }

  // ── Allocations ───────────────────────────────────────────────────────────

  @Get(':jobId/allocations')
  @RequirePermissions('production.jobs.read')
  getAllocations(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    return this.production.getAllocations(user.companyId, jobId);
  }

  @Post(':jobId/allocations/plan')
  @RequirePermissions('production.allocations.write')
  planAllocation(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: PlanAllocationDto,
  ) {
    return this.production.planAllocation(user.companyId, jobId, dto, user.sub);
  }

  @Post(':jobId/allocations/issue')
  @RequirePermissions('production.allocations.write')
  issueToProduction(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: IssueAllocationDto,
  ) {
    return this.production.issueToProduction(user.companyId, jobId, dto, user.sub);
  }

  @Post(':jobId/allocations/waste')
  @RequirePermissions('production.allocations.write')
  recordWaste(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: RecordWasteDto,
  ) {
    return this.production.recordWaste(user.companyId, jobId, dto, user.sub);
  }
}
