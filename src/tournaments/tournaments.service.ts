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
          include: { matches: { include: { homeTeam: true, awayTeam: true } } },
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
          include: { matches: { include: { homeTeam: true, awayTeam: true } } },
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

    for (const round of rounds) {
      await this.prisma.round.create({
        data: {
          number: round.number,
          name: round.name,
          groupId: round.groupId,
          groupName: round.groupName,
          phase: round.phase,
          tournamentId: tournament.id,
          matches: {
            create: round.matches.map((m: any, idx: number) => ({
              homeTeamId: tournament.teams.find((t: any) => t.name === m.homeName)?.id ?? null,
              awayTeamId: tournament.teams.find((t: any) => t.name === m.awayName)?.id ?? null,
              position: idx,
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

    return players
      .map(p => ({
        id: p.id,
        name: p.name,
        team: p.team.name,
        teamColor: p.team.color,
        goals: p.events.filter(e => e.type === 'GOAL').length,
        assists: p.events.filter(e => e.type === 'ASSIST').length,
        yellowCards: p.events.filter(e => e.type === 'YELLOW_CARD').length,
        redCards: p.events.filter(e => e.type === 'RED_CARD').length,
      }))
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists);
  }

  // ═══════════════════════════════════════════════════════
  // AUTO-GENERACIÓN DE FASE ELIMINATORIA
  // (soporta 'grupos' y 'dos-ligas')
  // ═══════════════════════════════════════════════════════

  async generateEliminationFromLeague(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        teams: true,
        rounds: { where: { phase: 'league' }, include: { matches: true } },
      },
    });
    if (!tournament) return;
    if (!['grupos', 'dos-ligas'].includes(tournament.format)) return;

    // Ya existe la fase eliminatoria → no hacemos nada
    const existing = await this.prisma.round.count({
      where: { tournamentId, phase: 'elimination' },
    });
    if (existing > 0) return;

    if (tournament.format === 'dos-ligas') {
      await this.generateDoubleLeagueElimination(tournament);
    } else {
      await this.generateSingleLeagueElimination(tournament);
    }
  }

  // ─── Caso grupos (una sola liga general) ───
  private async generateSingleLeagueElimination(tournament: any) {
    const standings = this.computeStandings(tournament.teams, tournament.rounds);
    const n = standings.length;

    let qualifiersCount = 0;
    if (n >= 8) qualifiersCount = 8;
    else if (n >= 5) qualifiersCount = 4;
    else if (n >= 3) qualifiersCount = 2;
    else return;

    const qualifiers = standings.slice(0, qualifiersCount);

    const pairs: [number, number][] = [];
    if (qualifiersCount === 8) {
      pairs.push([0, 7], [3, 4], [2, 5], [1, 6]);
    } else if (qualifiersCount === 4) {
      pairs.push([0, 3], [1, 2]);
    } else {
      pairs.push([0, 1]);
    }

    const last = await this.prisma.round.findFirst({
      where: { tournamentId: tournament.id, phase: 'league' },
      orderBy: { number: 'desc' },
    });
    const startNum = (last?.number || 0) + 1;

    let roundNames: string[];
    if (qualifiersCount === 8) roundNames = ['Cuartos', 'Semifinal', 'Final'];
    else if (qualifiersCount === 4) roundNames = ['Semifinal', 'Final'];
    else roundNames = ['Final'];

    await this.prisma.round.create({
      data: {
        number: startNum,
        name: roundNames[0],
        phase: 'elimination',
        tournamentId: tournament.id,
        matches: {
          create: pairs.map(([i, j], idx) => ({
            homeTeamId: qualifiers[i].id,
            awayTeamId: qualifiers[j].id,
            position: idx,
          })),
        },
      },
    });

    for (let r = 1; r < roundNames.length; r++) {
      const matchesCount = Math.max(1, qualifiersCount / Math.pow(2, r + 1));
      await this.prisma.round.create({
        data: {
          number: startNum + r,
          name: roundNames[r],
          phase: 'elimination',
          tournamentId: tournament.id,
          matches: {
            create: Array.from({ length: matchesCount }).map((_, idx) => ({
              position: idx,
            })),
          },
        },
      });
    }
  }

  // ─── Caso dos-ligas (cruce 1ºA vs último B, etc.) ───
  private async generateDoubleLeagueElimination(tournament: any) {
    const roundsA = tournament.rounds.filter((r: any) => r.groupName === 'Liga A');
    const roundsB = tournament.rounds.filter((r: any) => r.groupName === 'Liga B');

    const teamIdsA = new Set<string>();
    const teamIdsB = new Set<string>();
    roundsA.forEach((r: any) => r.matches.forEach((m: any) => {
      if (m.homeTeamId) teamIdsA.add(m.homeTeamId);
      if (m.awayTeamId) teamIdsA.add(m.awayTeamId);
    }));
    roundsB.forEach((r: any) => r.matches.forEach((m: any) => {
      if (m.homeTeamId) teamIdsB.add(m.homeTeamId);
      if (m.awayTeamId) teamIdsB.add(m.awayTeamId);
    }));

    const teamsA = tournament.teams.filter((t: any) => teamIdsA.has(t.id));
    const teamsB = tournament.teams.filter((t: any) => teamIdsB.has(t.id));

    const standingsA = this.computeStandings(teamsA, roundsA);
    const standingsB = this.computeStandings(teamsB, roundsB);

    const minN = Math.min(standingsA.length, standingsB.length);

    let perGroup = 0;
    if (minN >= 8) perGroup = 4;
    else if (minN >= 4) perGroup = 2;
    else if (minN >= 2) perGroup = 1;
    else return;

    const qualsA = standingsA.slice(0, perGroup);
    const qualsB = standingsB.slice(0, perGroup);
    const totalQuals = qualsA.length + qualsB.length;

    // Emparejamientos cruzados: 1ºA vs último de B, 2ºA vs penúltimo de B...
    const pairs: [any, any][] = [];
    for (let i = 0; i < perGroup; i++) {
      const a = qualsA[i];
      const b = qualsB[qualsB.length - 1 - i];
      if (a && b) pairs.push([a, b]);
    }

    const last = await this.prisma.round.findFirst({
      where: { tournamentId: tournament.id, phase: 'league' },
      orderBy: { number: 'desc' },
    });
    const startNum = (last?.number || 0) + 1;

    let roundNames: string[];
    if (totalQuals === 8) roundNames = ['Cuartos', 'Semifinal', 'Final'];
    else if (totalQuals === 4) roundNames = ['Semifinal', 'Final'];
    else roundNames = ['Final'];

    await this.prisma.round.create({
      data: {
        number: startNum,
        name: roundNames[0],
        phase: 'elimination',
        tournamentId: tournament.id,
        matches: {
          create: pairs.map(([home, away], idx) => ({
            homeTeamId: home.id,
            awayTeamId: away.id,
            position: idx,
          })),
        },
      },
    });

    for (let r = 1; r < roundNames.length; r++) {
      const matchesCount = Math.max(1, totalQuals / Math.pow(2, r + 1));
      await this.prisma.round.create({
        data: {
          number: startNum + r,
          name: roundNames[r],
          phase: 'elimination',
          tournamentId: tournament.id,
          matches: {
            create: Array.from({ length: matchesCount }).map((_, idx) => ({
              position: idx,
            })),
          },
        },
      });
    }
  }

  private computeStandings(teams: any[], rounds: any[]) {
    const map: Record<string, any> = {};
    teams.forEach((t: any) => {
      map[t.id] = { ...t, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, points: 0 };
    });
    rounds.forEach((r: any) => {
      r.matches.forEach((m: any) => {
        if (!m.played) return;
        const home = map[m.homeTeamId];
        const away = map[m.awayTeamId];
        if (!home || !away) return;
        home.played++; away.played++;
        home.gf += m.homeScore; home.ga += m.awayScore;
        away.gf += m.awayScore; away.ga += m.homeScore;
        home.gd = home.gf - home.ga;
        away.gd = away.gf - away.ga;
        if (m.homeScore > m.awayScore) {
          home.wins++; away.losses++; home.points += 3;
        } else if (m.homeScore < m.awayScore) {
          away.wins++; home.losses++; away.points += 3;
        } else {
          home.draws++; away.draws++; home.points += 1; away.points += 1;
        }
      });
    });
    return Object.values(map).sort(
      (a: any, b: any) => b.points - a.points || b.gd - a.gd || b.gf - a.gf
    );
  }

  // ═══════════════════════════════════════════════════════
  // GENERACIÓN DE FIXTURE
  // ═══════════════════════════════════════════════════════

  private generateFixture(teams: any[], format: string, doubleRound: boolean) {
    if (format === 'liga') {
      return this.roundRobin(teams, doubleRound).map(r => ({ ...r, phase: null }));
    }
    if (format === 'eliminatoria') {
      return this.bracket(teams).map(r => ({ ...r, phase: 'elimination' }));
    }
    if (format === 'dos-ligas') {
      return this.doubleLeague(teams, doubleRound);
    }
    // grupos → solo fase de liga; la eliminatoria se genera al terminar
    return this.roundRobin(teams, false).map(r => ({ ...r, phase: 'league' }));
  }

  // ─── Dos ligas separadas: Liga A y Liga B ───
  private doubleLeague(teams: any[], double: boolean) {
    // Repartimos alternados para que los grupos queden balanceados
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    const groupA = shuffled.filter((_, i) => i % 2 === 0);
    const groupB = shuffled.filter((_, i) => i % 2 === 1);

    const roundsA = this.roundRobin(groupA, double).map(r => ({
      ...r,
      phase: 'league',
      groupName: 'Liga A',
      groupId: 1,
    }));

    const roundsB = this.roundRobin(groupB, double).map(r => ({
      ...r,
      phase: 'league',
      groupName: 'Liga B',
      groupId: 2,
      number: r.number + roundsA.length,
      name: `Jornada ${r.number}`,
    }));

    return [...roundsA, ...roundsB];
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
    const totalRounds = Math.ceil(Math.log2(teams.length));
    const names = ['Final', 'Semifinal', 'Cuartos', 'Octavos'];

    while (current.length > 1 || rounds.length === 0) {
      const nameIndex = totalRounds - roundNum;
      const name = names[nameIndex] || `Ronda ${roundNum}`;

      const round = {
        number: roundNum,
        name,
        matches: [] as any[],
      };

      for (let i = 0; i < current.length; i += 2) {
        if (i + 1 < current.length) {
          round.matches.push({ homeName: current[i].name, awayName: current[i + 1].name });
        }
      }

      rounds.push(round);
      roundNum++;
      current = Array(Math.ceil(current.length / 2)).fill(null).map(() => ({ name: 'Por definir' }));
    }

    return rounds;
  }
}