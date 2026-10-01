import { Module } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { MatchesController } from './matches.controller';
import { TournamentsModule } from '../tournaments/tournaments.module';

@Module({
  imports: [TournamentsModule],
  providers: [MatchesService],
  controllers: [MatchesController],
})
export class MatchesModule {}