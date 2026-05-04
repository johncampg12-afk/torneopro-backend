import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
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
}
