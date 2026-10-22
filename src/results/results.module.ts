import { Module } from '@nestjs/common';
import {
  ResultsController,
  PublicResultsController,
} from './results.controller.js';
import { ResultsService } from './results.service.js';
@Module({
  controllers: [ResultsController, PublicResultsController],
  providers: [ResultsService],
})
export class ResultsModule {}
