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
    const names = ['Octavos', 'Cuartos', 'Semifinal', 'Final'];
    while (current.length > 1 || rounds.length === 0) {
      const round = {
        number: roundNum,
        name: names[Math.min(roundNum - 1, 3)] || `Ronda ${roundNum}`,
        matches: [] as any[],
      };
      for (let i = 0; i < current.length; i += 2) {
        if (i + 1 < current.length) {
          round.matches.push({ homeName: current[i].name, awayName: current[i + 1].name });
        }
        // Si hay un equipo sin pareja (impar), lo pasa automáticamente a la siguiente ronda
        else if (i === current.length - 1) {
          // Lo agregamos a la siguiente ronda como "Por definir" pero con el nombre real para que se asigne en el avance
          // (no se crea partido aquí, se manejará en la siguiente iteración)
        }
      }
      rounds.push(round);
      roundNum++;
      // Preparar la siguiente ronda: los ganadores ocuparán estos lugares
      current = Array(Math.ceil(current.length / 2))
        .fill(null)
        .map(() => ({ name: 'Por definir' }));
    }
    return rounds;
  }
}