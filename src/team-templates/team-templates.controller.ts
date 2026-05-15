import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TeamTemplatesService } from './team-templates.service';

@Controller('team-templates')
export class TeamTemplatesController {
  constructor(private service: TeamTemplatesService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@Request() req) {
    return this.service.findAllByUser(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Request() req, @Body() dto: { name: string; color?: string; logo?: string; players: { name: string; number?: number }[] }) {
    return this.service.create(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':templateId/import-to-team/:teamId')
  async importPlayersToTeam(
    @Param('templateId') templateId: string,
    @Param('teamId') teamId: string,
    @Request() req,
  ) {
    return this.service.importPlayersToTeam(templateId, teamId, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req) {
    return this.service.delete(id, req.user.userId);
  }
}