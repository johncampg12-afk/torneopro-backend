import { Module } from '@nestjs/common';
import { TeamTemplatesService } from './team-templates.service';
import { TeamTemplatesController } from './team-templates.controller';

@Module({
  providers: [TeamTemplatesService],
  controllers: [TeamTemplatesController],
})
export class TeamTemplatesModule {}