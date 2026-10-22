import { Module } from '@nestjs/common';
import { ReceiptPdfController, SalaryPdfController } from './pdf.controller.js';
@Module({ controllers: [ReceiptPdfController, SalaryPdfController] })
export class PdfModule {}
