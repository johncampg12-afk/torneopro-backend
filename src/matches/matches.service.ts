import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MatchesService {
  constructor(private prisma: PrismaService) {}

  async update(id: string, userId: string, dto: any) {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: {
        round: { include: { tournament: true } },
      },
    });
    if (!match) throw new NotFoundException('Match not found');
    if (match.round.tournament.ownerId !== userId) throw new ForbiddenException('Not your tournament');

    const homeScore = dto.homeScore !== undefined ? parseInt(dto.homeScore) : match.homeScore;
    const awayScore = dto.awayScore !== undefined ? parseInt(dto.awayScore) : match.awayScore;
    const played = homeScore !== null && awayScore !== null;
    const winnerId = played
      ? homeScore > awayScore
        ? match.homeTeamId
        : awayScore > homeScore
        ? match.awayTeamId
        : null
      : null;

    const updated = await this.prisma.match.update({
      where: { id },
      data: {
        homeScore: homeScore ?? null,
        awayScore: awayScore ?? null,
        played,
        winnerId,
        date: dto.date ? new Date(dto.date) : match.date,
        time: dto.time ?? match.time,
        location: dto.location ?? match.location,
      },
      include: { homeTeam: true, awayTeam: true, round: true },
    });

    // Advance winner in elimination bracket
    if (played && match.round.tournament.format === 'eliminatoria' && winnerId) {
      const nextRound = await this.prisma.round.findFirst({
        where: { tournamentId: match.round.tournamentId, number: match.round.number + 1 },
        include: { matches: true },
      });
      if (nextRound) {
        const matchIdx = nextRound.matches.findIndex(
          (m) => !m.homeTeamId || m.homeTeamId.startsWith('winner-'),
        );
        if (matchIdx !== -1) {
          const target = nextRound.matches[matchIdx];
          const updateData: any = {};
          if (!target.homeTeamId || target.homeTeamId.startsWith('winner-')) {
            updateData.homeTeamId = winnerId;
          } else {
            updateData.awayTeamId = winnerId;
          }
          await this.prisma.match.update({
            where: { id: target.id },
            data: updateData,
          });
        }
      }
    }

    return updated;
  }

  async addEvent(matchId: string, userId: string, dto: { playerId: string; type: string; minute?: number }) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { round: { include: { tournament: true } } },
    });
    if (!match) throw new NotFoundException('Match not found');
    if (match.round.tournament.ownerId !== userId) throw new ForbiddenException('Not your tournament');

    // Verificar que el jugador pertenezca a alguno de los equipos del partido
    const player = await this.prisma.player.findUnique({
      where: { id: dto.playerId },
      include: { team: true },
    });
    if (!player) throw new NotFoundException('Player not found');
    if (player.team.id !== match.homeTeamId && player.team.id !== match.awayTeamId) {
      throw new ForbiddenException('Player does not belong to teams in this match');
    }

    // Validar el tipo de evento
    const validTypes = ['GOAL', 'ASSIST', 'YELLOW_CARD', 'RED_CARD'];
    if (!validTypes.includes(dto.type)) {
      throw new BadRequestException('Invalid event type. Must be GOAL, ASSIST, YELLOW_CARD, or RED_CARD');
    }

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
}