import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MatchesService } from './matches.service';
import { BetsService } from '../bets/bets.service';

@Controller('matches')
export class MatchesController {
  constructor(
    private matchesService: MatchesService,
    private betsService: BetsService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(@Param('id') id: string, @Request() req, @Body() dto: any) {
    return this.matchesService.update(id, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/resolve-bets')
  async resolveBets(@Param('id') id: string, @Request() req) {
    // Verificar que el usuario es propietario del torneo al que pertenece el partido
    const match = await this.matchesService.hasPendingBets(id);
    // hasPendingBets solo cuenta; para validar ownership usamos el update interno del service
    // Mejor: pedimos al BetsService que resuelva, pero antes comprobamos ownership

    // Comprobamos ownership a través del servicio de bets (que internamente lo resuelve)
    // Validación previa: verificar que el match existe y pertenece al usuario
    // (el service de bets hará su propia validación adicional si la necesita)
    await this.betsService.resolveForMatchOwned(id, req.user.userId);

    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/bets-status')
  async betsStatus(@Param('id') id: string, @Request() req) {
    return this.matchesService.hasPendingBets(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/events')
  async addEvent(
    @Param('id') matchId: string,
    @Request() req,
    @Body() dto: { playerId: string; type: string; minute?: number },
  ) {
    return this.matchesService.addEvent(matchId, req.user.userId, dto);
  }

  @Get(':id/events')
  async getEvents(@Param('id') matchId: string) {
    return this.matchesService.getEvents(matchId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('events/:eventId')
  async updateEvent(
    @Param('eventId') eventId: string,
    @Request() req,
    @Body() dto: { type?: string; minute?: number },
  ) {
    return this.matchesService.updateEvent(eventId, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('events/:eventId')
  async deleteEvent(@Param('eventId') eventId: string, @Request() req) {
    return this.matchesService.deleteEvent(eventId, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('round/:roundId')
  async createMatch(
    @Param('roundId') roundId: string,
    @Request() req,
    @Body() dto: { homeTeamId?: string; awayTeamId?: string; date?: string; time?: string; location?: string },
  ) {
    return this.matchesService.createMatch(roundId, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteMatch(@Param('id') id: string, @Request() req) {
    return this.matchesService.deleteMatch(id, req.user.userId);
  }
}