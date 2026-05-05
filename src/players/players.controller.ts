import { Controller, Post, Get, Patch, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlayersService } from './players.service';

@Controller('players')
export class PlayersController {
  constructor(private playersService: PlayersService) {}

  @UseGuards(JwtAuthGuard)
  @Post('team/:teamId')
  async create(@Param('teamId') teamId: string, @Request() req, @Body() dto: { name: string; number?: number }) {
    return this.playersService.create(teamId, req.user.userId, dto);
  }

  @Get('team/:teamId')
  async findByTeam(@Param('teamId') teamId: string) {
    return this.playersService.findByTeam(teamId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(@Param('id') id: string, @Request() req, @Body() dto: { name?: string; number?: number }) {
    return this.playersService.update(id, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req) {
    return this.playersService.delete(id, req.user.userId);
  }
}