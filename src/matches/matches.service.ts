import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from '../tournaments/tournaments.service';

@Injectable()
export class MatchesService {
  constructor(
    private prisma: PrismaService,
    private tournamentsService: TournamentsService,
  ) {}

  async update(id: string, userId: string, dto: any) {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: { round: { include: { tournament: true } } },
    });
    if (!match) throw new NotFoundException('Match not found');
    if (match.round.tournament.ownerId !== userId) throw new ForbiddenException('Not your tournament');

    // Validar cambio de equipos (solo si no jugado)
    if (!match.played) {
      if (dto.homeTeamId || dto.awayTeamId) {
        const tid = match.round.tournament.id;
        if (dto.homeTeamId) {
          const t = await this.prisma.team.findUnique({ where: { id: dto.homeTeamId } });
          if (!t || t.tournamentId !== tid) throw new BadRequestException('Invalid home team');
        }
        if (dto.awayTeamId) {
          const t = await this.prisma.team.findUnique({ where: { id: dto.awayTeamId } });
          if (!t || t.tournamentId !== tid) throw new BadRequestException('Invalid away team');
        }
      }
    } else {
      delete dto.homeTeamId;
      delete dto.awayTeamId;
    }

    const homeScore = dto.homeScore !== undefined ? parseInt(dto.homeScore) : match.homeScore;
    const awayScore = dto.awayScore !== undefined ? parseInt(dto.awayScore) : match.awayScore;
    const played = homeScore !== null && awayScore !== null;
    const winnerId = played
      ? homeScore > awayScore
        ? (dto.homeTeamId || match.homeTeamId)
        : awayScore > homeScore
          ? (dto.awayTeamId || match.awayTeamId)
          : null
      : null;

    const updated = await this.prisma.match.update({
      where: { id },
      data: {
        homeScore: homeScore ?? null,
        awayScore: awayScore ?? null,
        played,
        winnerId,
        ...(dto.homeTeamId && { homeTeamId: dto.homeTeamId }),
        ...(dto.awayTeamId && { awayTeamId: dto.awayTeamId }),
        date: dto.date ? new Date(dto.date) : match.date,
        time: dto.time ?? match.time,
        location: dto.location ?? match.location,
      },
      include: { homeTeam: true, awayTeam: true, round: true },
    });

    // Avance de ganadores en eliminatoria
    if (played && match.round.phase === 'elimination' && winnerId) {
      const position = match.position;
      if (position !== null && position !== undefined) {
        const nextRound = await this.prisma.round.findFirst({
          where: {
            tournamentId: match.round.tournamentId,
            phase: 'elimination',
            number: match.round.number + 1,
          },
          include: { matches: { orderBy: { position: 'asc' } } },
        });
        if (nextRound && nextRound.matches.length > 0) {
          const targetIdx = Math.floor(position / 2);
          const target = nextRound.matches[targetIdx];
          if (target) {
            const isHome = position % 2 === 0;
            await this.prisma.match.update({
              where: { id: target.id },
              data: isHome ? { homeTeamId: winnerId } : { awayTeamId: winnerId },
            });
          }
        }
      }
    }

    // Auto-gestión de la fase eliminatoria en grupos
    if (match.round.tournament.format === 'grupos' && match.round.phase === 'league') {
      const leagueRounds = await this.prisma.round.findMany({
        where: { tournamentId: match.round.tournamentId, phase: 'league' },
        include: { matches: true },
      });
      const allPlayed = leagueRounds.every(r => r.matches.every(m => m.played));
      const hasElim = await this.prisma.round.count({
        where: { tournamentId: match.round.tournamentId, phase: 'elimination' },
      });

      if (allPlayed && hasElim === 0) {
        await this.tournamentsService.generateEliminationFromLeague(match.round.tournamentId);
      } else if (!allPlayed && hasElim > 0) {
        // Si se deshace un resultado de liga, se borra la eliminatoria para regenerarla después
        await this.prisma.round.deleteMany({
          where: { tournamentId: match.round.tournamentId, phase: 'elimination' },
        });
      }
    }

    return updated;
  }

  async createMatch(roundId: string, userId: string, dto: any) {
    const round = await this.prisma.round.findUnique({
      where: { id: roundId },
      include: { tournament: true },
    });
    if (!round) throw new NotFoundException('Round not found');
    if (round.tournament.ownerId !== userId) throw new ForbiddenException('Not your tournament');

    return this.prisma.match.create({
      data: {
        roundId,
        homeTeamId: dto.homeTeamId || null,
        awayTeamId: dto.awayTeamId || null,
        date: dto.date ? new Date(dto.date) : null,
        time: dto.time || null,
        location: dto.location || null,
        played: false,
      },
      include: { homeTeam: true, awayTeam: true },
    });
  }

  async deleteMatch(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { round: { include: { tournament: true } } },
    });
    if (!match) throw new NotFoundException('Match not found');
    if (match.round.tournament.ownerId !== userId) throw new ForbiddenException('Not your tournament');

    await this.prisma.matchEvent.deleteMany({ where: { matchId } });
    await this.prisma.match.delete({ where: { id: matchId } });
    return { deleted: true };
  }

  async addEvent(matchId: string, userId: string, dto: { playerId: string; type: string; minute?: number }) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { round: { include: { tournament: true } } },
    });
    if (!match) throw new NotFoundException('Match not found');
    if (match.round.tournament.ownerId !== userId) throw new ForbiddenException('Not your tournament');

    const player = await this.prisma.player.findUnique({
      where: { id: dto.playerId },
      include: { team: true },
    });
    if (!player) throw new NotFoundException('Player not found');
    if (player.team.id !== match.homeTeamId && player.team.id !== match.awayTeamId) {
      throw new ForbiddenException('Player does not belong to teams in this match');
    }

    const validTypes = ['GOAL', 'ASSIST', 'YELLOW_CARD', 'RED_CARD'];
    if (!validTypes.includes(dto.type)) throw new BadRequestException('Invalid event type');

    return this.prisma.matchEvent.create({
      data: {
        type: dto.type as any,
        playerId: dto.playerId,
        matchId: match.id,
        minute: dto.minute ?? null,
      },
      include: { player: true },
    });
  }

  async getEvents(matchId: string) {
    return this.prisma.matchEvent.findMany({
      where: { matchId },
      include: { player: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateEvent(eventId: string, userId: string, dto: { type?: string; minute?: number }) {
    const event = await this.prisma.matchEvent.findUnique({
      where: { id: eventId },
      include: { match: { include: { round: { include: { tournament: true } } } } },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (event.match.round.tournament.ownerId !== userId) throw new ForbiddenException('Not your tournament');

    const validTypes = ['GOAL', 'ASSIST', 'YELLOW_CARD', 'RED_CARD'];
    if (dto.type && !validTypes.includes(dto.type)) throw new BadRequestException('Invalid event type');

    return this.prisma.matchEvent.update({
      where: { id: eventId },
      data: {
        ...(dto.type && { type: dto.type as any }),
        ...(dto.minute !== undefined && { minute: dto.minute }),
      },
      include: { player: true },
    });
  }

  async deleteEvent(eventId: string, userId: string) {
    const event = await this.prisma.matchEvent.findUnique({
      where: { id: eventId },
      include: { match: { include: { round: { include: { tournament: true } } } } },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (event.match.round.tournament.ownerId !== userId) throw new ForbiddenException('Not your tournament');

    await this.prisma.matchEvent.delete({ where: { id: eventId } });
    return { deleted: true };
  }

  /**
   * Indica si un partido tiene apuestas pendientes de resolver.
   * Útil para mostrar el botón "Repartir premios" solo cuando aplica.
   */
  async hasPendingBets(matchId: string) {
    const count = await this.prisma.bet.count({
      where: { matchId, resolved: false },
    });
    return { hasPending: count > 0, count };
  }
}