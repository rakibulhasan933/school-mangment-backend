import { Module } from '@nestjs/common';
import { SeatPlansController } from './seat-plans.controller.js';
import { SeatPlansService } from './seat-plans.service.js';
import { SmsModule } from '../sms/sms.module.js';

@Module({ imports: [SmsModule], controllers: [SeatPlansController], providers: [SeatPlansService] })
export class SeatPlansModule {}
