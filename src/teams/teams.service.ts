import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  async create(tournamentId: string, userId: string, dto: any) {
    const tournament = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) throw new NotFoundException('Tournament not found');
    if (tournament.ownerId !== userId) throw new ForbiddenException('Not your tournament');

    return this.prisma.team.create({
      data: {
        name: dto.name,
        color: dto.color || '#3b82f6',
        logo: dto.logo,
        tournamentId,
      },
      include: { players: true },
    });
  }

  async update(id: string, userId: string, dto: any) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: { tournament: true },
    });
    if (!team) throw new NotFoundException('Team not found');
    if (team.tournament.ownerId !== userId) throw new ForbiddenException('Not your tournament');

    return this.prisma.team.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.color && { color: dto.color }),
        ...(dto.logo && { logo: dto.logo }),
      },
    });
  }

  async addTeamsToTournament(tournamentId: string, userId: string, newTeams: { name: string; color?: string; logo?: string }[]) {
    const tournament = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) throw new NotFoundException('Tournament not found');
    if (tournament.ownerId !== userId) throw new ForbiddenException('No autorizado');

    // Crear los nuevos equipos
    const createdTeams = [];
    for (const t of newTeams) {
      const team = await this.prisma.team.create({
        data: { name: t.name, color: t.color || '#3b82f6', logo: t.logo || null, tournamentId },
      });
      createdTeams.push(team);
    }

    // Si el formato es liga, generar jornadas extra
    if (tournament.format === 'liga') {
      const allTeams = await this.prisma.team.findMany({ where: { tournamentId } });
      const lastRound = await this.prisma.round.findFirst({ where: { tournamentId }, orderBy: { number: 'desc' } });
      const startNumber = (lastRound?.number || 0) + 1;
      const extraRounds = this.generateExtraRounds(allTeams, tournament, startNumber, createdTeams.map(t => t.id));

      for (const round of extraRounds) {
        await this.prisma.round.create({
          data: {
            number: round.number,
            name: `Jornada ${round.number} (adicional)`,
            tournamentId,
            matches: {
              create: round.matches.map(m => ({
                homeTeamId: m.homeId,
                awayTeamId: m.awayId,
              })),
            },
          },
        });
      }
    }

    return createdTeams;
  }

  private async generateExtraRounds(allTeams: any[], tournament: any, startNumber: number, newTeamIds: string[]) {
    const rounds = [];
    const originalTeamIds = allTeams.filter(t => !newTeamIds.includes(t.id)).map(t => t.id);
    let roundNum = startNumber;

    for (const newTeamId of newTeamIds) {
      for (const origTeamId of originalTeamIds) {
        const existing = await this.prisma.match.findFirst({
          where: {
            round: { tournamentId: tournament.id },  // ← corregido
            OR: [
              { homeTeamId: newTeamId, awayTeamId: origTeamId },
              { homeTeamId: origTeamId, awayTeamId: newTeamId },
            ],
          },
        });
        if (!existing) {
          rounds.push({
            number: roundNum,
            matches: [{ homeId: newTeamId, awayId: origTeamId }],
          });
          roundNum++;
        }
      }
    }

    for (let i = 0; i < newTeamIds.length; i++) {
      for (let j = i + 1; j < newTeamIds.length; j++) {
        rounds.push({
          number: roundNum,
          matches: [{ homeId: newTeamIds[i], awayId: newTeamIds[j] }],
        });
        roundNum++;
      }
    }

    return rounds;
  }

  async delete(id: string, userId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: { tournament: true },
    });
    if (!team) throw new NotFoundException('Team not found');
    if (team.tournament.ownerId !== userId) throw new ForbiddenException('Not your tournament');
    await this.prisma.team.delete({ where: { id } });
    return { deleted: true };
  }
}
