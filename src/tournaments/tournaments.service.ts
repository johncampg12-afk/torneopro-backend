import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TournamentsService {
  constructor(private prisma: PrismaService) {}

  async findPublic(search?: string) {
    return this.prisma.tournament.findMany({
      where: {
        isPublic: true,
        status: { not: 'draft' },
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      include: {
        owner: { select: { name: true } },
        teams: true,
        rounds: { include: { matches: true } },
        _count: { select: { teams: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByShareCode(shareCode: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { shareCode },
      include: {
        owner: { select: { name: true } },
        teams: true,
        rounds: {
          include: {
            matches: {
              include: { homeTeam: true, awayTeam: true },
            },
          },
          orderBy: { number: 'asc' },
        },
      },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    if (!tournament.isPublic && tournament.status === 'draft') {
      throw new ForbiddenException('This tournament is private');
    }
    return tournament;
  }

  async findByOwner(ownerId: string, search?: string) {
    return this.prisma.tournament.findMany({
      where: {
        ownerId,
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      include: {
        teams: true,
        rounds: { include: { matches: true } },
        _count: { select: { teams: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        owner: { select: { name: true } },
        teams: { include: { players: true } },
        rounds: {
          include: {
            matches: {
              include: { homeTeam: true, awayTeam: true },
            },
          },
          orderBy: { number: 'asc' },
        },
      },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    if (tournament.ownerId !== userId) throw new ForbiddenException('Not your tournament');
    return tournament;
  }

  async create(ownerId: string, dto: any) {
    const teams = dto.teams.map((t: any) => ({
      name: t.name,
      color: t.color || '#3b82f6',
    }));

    const rounds = this.generateFixture(teams, dto.format, dto.doubleRound || false);

    const tournament = await this.prisma.tournament.create({
      data: {
        name: dto.name,
        description: dto.description,
        sport: dto.sport,
        format: dto.format,
        doubleRound: dto.doubleRound || false,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        location: dto.location,
        isPublic: dto.isPublic !== false,
        ownerId,
        teams: { create: teams },
      },
      include: { teams: true },
    });

    // Create rounds and matches
    for (const round of rounds) {
      await this.prisma.round.create({
        data: {
          number: round.number,
          name: round.name,
          groupId: round.groupId,
          groupName: round.groupName,
          tournamentId: tournament.id,
          matches: {
            create: round.matches.map((m: any) => ({
              homeTeamId: tournament.teams.find((t: any) => t.name === m.homeName)?.id ?? null,
              awayTeamId: tournament.teams.find((t: any) => t.name === m.awayName)?.id ?? null,
            })),
          },
        },
      });
    }

    return this.findOne(tournament.id, ownerId);
  }

  async update(id: string, userId: string, dto: any) {
    const tournament = await this.prisma.tournament.findUnique({ where: { id } });
    if (!tournament) throw new NotFoundException('Tournament not found');
    if (tournament.ownerId !== userId) throw new ForbiddenException('Not your tournament');

    return this.prisma.tournament.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status && { status: dto.status }),
        ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.location !== undefined && { location: dto.location }),
      },
    });
  }

  async delete(id: string, userId: string) {
    const tournament = await this.prisma.tournament.findUnique({ where: { id } });
    if (!tournament) throw new NotFoundException('Tournament not found');
    if (tournament.ownerId !== userId) throw new ForbiddenException('Not your tournament');
    await this.prisma.tournament.delete({ where: { id } });
    return { deleted: true };
  }

  async getTopScorers(tournamentId: string) {
    const players = await this.prisma.player.findMany({
      where: { team: { tournamentId } },
      include: {
        events: true,
        team: { select: { name: true, color: true } },
      },
    });

    const stats = players.map(p => ({
      id: p.id,
      name: p.name,
      team: p.team.name,
      teamColor: p.team.color,
      goals: p.events.filter(e => e.type === 'GOAL').length,
      assists: p.events.filter(e => e.type === 'ASSIST').length,
      yellowCards: p.events.filter(e => e.type === 'YELLOW_CARD').length,
      redCards: p.events.filter(e => e.type === 'RED_CARD').length,
    }));

    return stats.sort((a, b) => b.goals - a.goals || b.assists - a.assists);
  }

  private generateFixture(teams: any[], format: string, doubleRound: boolean) {
    if (format === 'liga') return this.roundRobin(teams, doubleRound);
    if (format === 'eliminatoria') return this.bracket(teams);
    return this.roundRobin(teams, false); // grupos simplificado
  }

  private roundRobin(teams: any[], double: boolean) {
    const t = [...teams];
    if (t.length % 2 !== 0) t.push({ name: '__BYE__', color: '#333' });
    const rounds = [];
    const n = t.length;
    for (let r = 0; r < n - 1; r++) {
      const round = { number: r + 1, name: `Jornada ${r + 1}`, matches: [] as any[] };
      for (let i = 0; i < n / 2; i++) {
        const home = t[i];
        const away = t[n - 1 - i];
        if (home.name !== '__BYE__' && away.name !== '__BYE__') {
          round.matches.push({ homeName: home.name, awayName: away.name });
        }
      }
      rounds.push(round);
      t.splice(1, 0, t.pop()!);
    }
    if (double) {
      const second = rounds.map((round, idx) => ({
        number: rounds.length + idx + 1,
        name: `Jornada ${rounds.length + idx + 1}`,
        matches: round.matches.map(m => ({ homeName: m.awayName, awayName: m.homeName })),
      }));
      return [...rounds, ...second];
    }
    return rounds;
  }

  private bracket(teams: any[]) {
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    const rounds = [];
    let current = shuffled;
    let roundNum = 1;
    
    // Número total de rondas necesarias según el número de equipos
    const totalRounds = Math.ceil(Math.log2(teams.length));
    // Las rondas se nombran de atrás hacia adelante: Final, Semifinal, Cuartos, Octavos...
    const roundNames = ['Final', 'Semifinal', 'Cuartos', 'Octavos'];
    
    while (current.length > 1 || rounds.length === 0) {
      // Calcular el nombre según la ronda actual (la última es "Final", la anterior "Semifinal", etc.)
      const nameIndex = totalRounds - roundNum;
      const name = roundNames[nameIndex] || `Ronda ${roundNum}`;
      
      const round = {
        number: roundNum,
        name,
        matches: [] as any[],
      };
      
      for (let i = 0; i < current.length; i += 2) {
        if (i + 1 < current.length) {
          round.matches.push({ homeName: current[i].name, awayName: current[i + 1].name });
        }
        // Si hay un equipo impar (i es el último y no tiene pareja), pasa automáticamente a la siguiente ronda
        else if (i === current.length - 1) {
          // No se crea partido en esta ronda, el equipo avanzará directamente
        }
      }
      
      rounds.push(round);
      roundNum++;
      current = Array(Math.ceil(current.length / 2)).fill(null).map(() => ({ name: 'Por definir' }));
    }
    
    return rounds;
  }
}