import { Controller, Post, Patch, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TeamsService } from './teams.service';

@Controller('teams')
export class TeamsController {
  constructor(private teamsService: TeamsService) {}

  @UseGuards(JwtAuthGuard)
  @Post(':tournamentId')
  async create(@Param('tournamentId') tournamentId: string, @Request() req, @Body() dto: any) {
    return this.teamsService.create(tournamentId, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(@Param('id') id: string, @Request() req, @Body() dto: any) {
    return this.teamsService.update(id, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req) {
    return this.teamsService.delete(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('bulk/:tournamentId')
  async addTeams(
    @Param('tournamentId') tournamentId: string,
    @Request() req,
    @Body() dto: { teams: { name: string; color?: string; logo?: string }[] }
  ) {
    return this.teamsService.addTeamsToTournament(tournamentId, req.user.userId, dto.teams);
  }
}
