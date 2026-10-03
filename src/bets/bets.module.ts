import { Module } from '@nestjs/common';
import { BetsService } from './bets.service';
import { BetsController } from './bets.controller';

@Module({
  providers: [BetsService],
  controllers: [BetsController],
  exports: [BetsService],
})
export class BetsModule {}