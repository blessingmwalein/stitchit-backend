import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { DocumentRendererService } from './document-renderer.service';
import { PdfProcessor } from '../../queues/processors/pdf.processor';

@Module({
  providers: [PdfService, DocumentRendererService, PdfProcessor],
  exports: [PdfService, DocumentRendererService],
})
export class PdfModule {}
