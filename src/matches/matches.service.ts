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

    // Winner del partido individual (para rondas a partido único)
    let winnerId = played
      ? homeScore > awayScore
        ? (dto.homeTeamId || match.homeTeamId)
        : awayScore > homeScore
          ? (dto.awayTeamId || match.awayTeamId)
          : null
      : null;

    // ⬅️ NUEVO: si es vuelta de una eliminatoria a doble partido, calcular el agregado
    let aggregateWinnerId: string | null = null;
    let isReturnLeg = false;

    if (
      played &&
      match.round.phase === 'elimination' &&
      match.round.legs === 2 &&
      match.position !== null &&
      match.position !== undefined &&
      match.position % 2 === 1
    ) {
      isReturnLeg = true;
      const idaMatch = await this.prisma.match.findFirst({
        where: { roundId: match.roundId, position: match.position - 1 },
      });

      if (idaMatch && idaMatch.played && idaMatch.homeScore !== null && idaMatch.awayScore !== null) {
        // ida:    A (home) vs B (away)
        // vuelta: B (home) vs A (away)
        const teamA_id = idaMatch.homeTeamId;
        const teamB_id = idaMatch.awayTeamId;

        const teamA_total = (idaMatch.homeScore || 0) + (awayScore || 0);
        const teamB_total = (idaMatch.awayScore || 0) + (homeScore || 0);

        if (teamA_total > teamB_total) {
          aggregateWinnerId = teamA_id;
        } else if (teamB_total > teamA_total) {
          aggregateWinnerId = teamB_id;
        } else {
          // Empate global → desempate por goles fuera de casa
          const teamA_away = awayScore || 0;            // goles de A en vuelta (de visitante)
          const teamB_away = idaMatch.awayScore || 0;   // goles de B en ida (de visitante)
          if (teamA_away > teamB_away) aggregateWinnerId = teamA_id;
          else if (teamB_away > teamA_away) aggregateWinnerId = teamB_id;
          // Si sigue empatado: no avanza automáticamente (requiere penales o edición manual)
        }

        if (aggregateWinnerId) winnerId = aggregateWinnerId;
      }
    }

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

    // ⬅️ Avance de ganadores en eliminatoria (con soporte ida/vuelta)
    if (played && match.round.phase === 'elimination') {
      const position = match.position;

      if (match.round.legs === 2) {
        // ── Ronda a doble partido (Cuartos) ──
        // Solo avanzamos cuando se juega la vuelta (posición impar) y hay ganador global
        if (isReturnLeg && aggregateWinnerId && position !== null && position !== undefined) {
          const tieIndex = Math.floor((position - 1) / 2);       // 0, 1, 2, 3
          const nextRoundPosition = Math.floor(tieIndex / 2);    // 0, 0, 1, 1
          const isHome = tieIndex % 2 === 0;                     // 0→home, 1→away, 2→home, 3→away

          const nextRound = await this.prisma.round.findFirst({
            where: {
              tournamentId: match.round.tournamentId,
              phase: 'elimination',
              number: match.round.number + 1,
            },
            include: { matches: { orderBy: { position: 'asc' } } },
          });

          if (nextRound && nextRound.matches[nextRoundPosition]) {
            await this.prisma.match.update({
              where: { id: nextRound.matches[nextRoundPosition].id },
              data: isHome
                ? { homeTeamId: aggregateWinnerId }
                : { awayTeamId: aggregateWinnerId },
            });
          }
        }
        // Si es la ida: no avanzamos, esperamos a la vuelta
      } else {
        // ── Partido único (Semifinal, Final) ──
        if (winnerId && position !== null && position !== undefined) {
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
    }

    // Auto-gestión de la fase eliminatoria en grupos y en 2 ligas (sin cambios)
    if (
      ['grupos', 'dos-ligas'].includes(match.round.tournament.format) &&
      match.round.phase === 'league'
    ) {
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