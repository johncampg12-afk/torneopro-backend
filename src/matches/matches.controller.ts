import { Controller, Patch, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MatchesService } from './matches.service';

@Controller('matches')
export class MatchesController {
  constructor(private matchesService: MatchesService) {}

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(@Param('id') id: string, @Request() req, @Body() dto: any) {
    return this.matchesService.update(id, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/events')
  async addEvent(@Param('id') matchId: string, @Request() req, @Body() dto: { playerId: string; type: string; minute?: number }) {
    return this.matchesService.addEvent(matchId, req.user.userId, dto);
  }

  @Get(':id/events')
  async getEvents(@Param('id') matchId: string) {
    return this.matchesService.getEvents(matchId);
  }
}