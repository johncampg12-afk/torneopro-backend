import { Module } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { MatchesController } from './matches.controller';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { BetsModule } from '../bets/bets.module';


@Module({
  imports: [TournamentsModule, BetsModule],
  providers: [MatchesService],
  controllers: [MatchesController],
})
export class MatchesModule {}