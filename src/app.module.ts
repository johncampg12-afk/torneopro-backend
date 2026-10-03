import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { TeamsModule } from './teams/teams.module';
import { MatchesModule } from './matches/matches.module';
import { PrismaModule } from './prisma/prisma.module';
import { PlayersModule } from './players/players.module';
import { TeamTemplatesModule } from './team-templates/team-templates.module';
import { BetsModule } from './bets/bets.module';
import { RewardsModule } from './rewards/rewards.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    TournamentsModule,
    TeamsModule,
    MatchesModule,
    PlayersModule,
    TeamTemplatesModule,
    BetsModule,
    RewardsModule,
  ],
})
export class AppModule {}
