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

  private generateExtraRounds(allTeams: any[], tournament: any, startNumber: number, newTeamIds: string[]) {
    const rounds = [];
    // Para cada nuevo equipo, enfrentarlo contra todos los equipos originales (si no han jugado ya)
    const originalTeamIds = allTeams.filter(t => !newTeamIds.includes(t.id)).map(t => t.id);
    let roundNum = startNumber;

    // Simplificación: generar una ronda por cada enfrentamiento pendiente, pero mejor agrupar varios partidos en una ronda.
    // Vamos a crear una sola ronda con todos los partidos nuevos, y luego si es necesario más rondas (por ejemplo, si hay más partidos que equipos/2). Pero para simplificar, podemos meter todos los partidos en una sola ronda, aunque sea poco realista. Sin embargo, el algoritmo round-robin estándar no se puede aplicar fácilmente a equipos añadidos después. Para que sea útil, haremos rondas donde cada nuevo equipo juega contra cada original en rondas separadas (como un aplazado). Eso crea muchas rondas pero es fácil de entender.

    for (const newTeamId of newTeamIds) {
      for (const origTeamId of originalTeamIds) {
        // Verificar que no exista ya un partido entre estos dos equipos en cualquier ronda
        const existing = await this.prisma.match.findFirst({
          where: {
            round: { tournamentId },
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
    // También partidos entre los nuevos equipos (si hay más de uno)
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
