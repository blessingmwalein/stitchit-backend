import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { FilesService } from './files.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@CurrentUser() user: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > MAX_FILE_BYTES) throw new BadRequestException('File exceeds 10MB limit');
    return this.files.upload(file, {
      companyId: user.companyId,
      uploadedByUserId: user.aud === 'staff' ? user.sub : undefined,
      uploadedByCustomerId: user.aud === 'customer' ? user.sub : undefined,
    });
  }

  @Get(':id')
  async meta(@Param('id') id: string) {
    return this.files.getMeta(id);
  }

  @Get(':id/download-url')
  downloadUrl(@Param('id') id: string) {
    return this.files.downloadUrl(id);
  }

  @Get(':id/raw')
  async raw(@Param('id') id: string, @Res() res: Response) {
    const { buffer, fileName, mimeType } = await this.files.buffer(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(buffer);
  }
}
