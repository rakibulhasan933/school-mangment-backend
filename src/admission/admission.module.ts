import { Module } from '@nestjs/common';
import {
  AdmissionController,
  PublicAdmissionController,
} from './admission.controller.js';
import { AdmissionService } from './admission.service.js';
@Module({
  controllers: [AdmissionController, PublicAdmissionController],
  providers: [AdmissionService],
})
export class AdmissionModule {}
