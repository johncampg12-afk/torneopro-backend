import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MIN_BET = 10;
const MAX_BET = 300;

@Injectable()
export class BetsService {
  constructor(private prisma: PrismaService) {}

  async place(userId: string, dto: { matchId: string; prediction: string; amount: number }) {
    if (!['home', 'away'].includes(dto.prediction)) {
      throw new BadRequestException('Predicción inválida');
    }
    const amount = parseInt(String(dto.amount));
    if (isNaN(amount) || amount < MIN_BET || amount > MAX_BET) {
      throw new BadRequestException(`La apuesta debe estar entre ${MIN_BET} y ${MAX_BET} coins`);
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (!user.isAdultConfirmed) throw new ForbiddenException('Debes confirmar que eres mayor de 18 años');

    const match = await this.prisma.match.findUnique({
      where: { id: dto.matchId },
      include: { round: { include: { tournament: true } } },
    });
    if (!match) throw new NotFoundException('Partido no encontrado');
    if (match.played) throw new BadRequestException('El partido ya se ha jugado');
    if (match.date && new Date(match.date) <= new Date()) {
      throw new BadRequestException('El partido ya ha comenzado');
    }

    // ¿Ya apostó en este partido?
    const existing = await this.prisma.bet.findFirst({
      where: { userId, matchId: dto.matchId, resolved: false },
    });
    if (existing) throw new BadRequestException('Ya tienes una apuesta activa en este partido');

    if (user.coins < amount) throw new BadRequestException('No tienes suficientes coins');

    // Transacción: descontar coins + crear apuesta
    const [updatedUser, bet] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { coins: { decrement: amount } },
      }),
      this.prisma.bet.create({
        data: {
          userId,
          matchId: dto.matchId,
          prediction: dto.prediction,
          amount,
        },
      }),
    ]);

    return { bet, coins: updatedUser.coins };
  }

  async findMine(userId: string) {
    return this.prisma.bet.findMany({
      where: { userId },
      include: {
        match: {
          include: {
            homeTeam: true,
            awayTeam: true,
            round: { include: { tournament: { select: { id: true, name: true, shareCode: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findMineForMatch(userId: string, matchId: string) {
    return this.prisma.bet.findFirst({
      where: { userId, matchId },
    });
  }

  async statsForMatch(matchId: string) {
    const bets = await this.prisma.bet.findMany({ where: { matchId } });
    const total = bets.reduce((a, b) => a + b.amount, 0);
    const home = bets.filter(b => b.prediction === 'home').reduce((a, b) => a + b.amount, 0);
    const away = bets.filter(b => b.prediction === 'away').reduce((a, b) => a + b.amount, 0);
    return {
      total,
      home,
      away,
      homePct: total > 0 ? Math.round((home / total) * 100) : 0,
      awayPct: total > 0 ? Math.round((away / total) * 100) : 0,
      count: bets.length,
    };
  }

  /**
   * Resuelve todas las apuestas de un partido.
   * Si hay empate → se devuelve el 100% a cada uno.
   * Si hay ganador → los acertantes se reparten el pool proporcionalmente.
   */
  async resolveForMatch(matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match || !match.played) return;

    const bets = await this.prisma.bet.findMany({
      where: { matchId, resolved: false },
    });
    if (bets.length === 0) return;

    const total = bets.reduce((a, b) => a + b.amount, 0);

    // Empate → devolver el 100%
    if (match.homeScore === match.awayScore) {
      await this.prisma.$transaction([
        ...bets.map(b =>
          this.prisma.bet.update({
            where: { id: b.id },
            data: { resolved: true, won: null, payout: b.amount, resolvedAt: new Date() },
          }),
        ),
        ...bets.map(b =>
          this.prisma.user.update({
            where: { id: b.userId },
            data: { coins: { increment: b.amount } },
          }),
        ),
      ]);
      return;
    }

    const winnerSide = match.homeScore! > match.awayScore! ? 'home' : 'away';
    const winningBets = bets.filter(b => b.prediction === winnerSide);
    const losingBets = bets.filter(b => b.prediction !== winnerSide);

    if (winningBets.length === 0) {
      // Nadie acertó → devolver a todos
      await this.prisma.$transaction([
        ...bets.map(b =>
          this.prisma.bet.update({
            where: { id: b.id },
            data: { resolved: true, won: null, payout: b.amount, resolvedAt: new Date() },
          }),
        ),
        ...bets.map(b =>
          this.prisma.user.update({
            where: { id: b.userId },
            data: { coins: { increment: b.amount } },
          }),
        ),
      ]);
      return;
    }

    const winningPool = winningBets.reduce((a, b) => a + b.amount, 0);

    await this.prisma.$transaction([
      // Ganadores: recuperan su apuesta + reparto proporcional del pool perdedor
      ...winningBets.map(b => {
        const share = (b.amount / winningPool) * total;
        const payout = Math.round(share);
        return this.prisma.bet.update({
          where: { id: b.id },
          data: { resolved: true, won: true, payout, resolvedAt: new Date() },
        });
      }),
      ...winningBets.map(b => {
        const share = (b.amount / winningPool) * total;
        const payout = Math.round(share);
        return this.prisma.user.update({
          where: { id: b.userId },
          data: {
            coins: { increment: payout },
            totalCoinsEarned: { increment: payout - b.amount > 0 ? payout - b.amount : 0 },
          },
        });
      }),
      // Perdedores: ya perdieron su apuesta al apostar, solo marcamos como resuelta
      ...losingBets.map(b =>
        this.prisma.bet.update({
          where: { id: b.id },
          data: { resolved: true, won: false, payout: 0, resolvedAt: new Date() },
        }),
      ),
    ]);
  }

  /**
   * Resuelve las apuestas de un partido validando primero que el usuario
   * autenticado es el propietario del torneo al que pertenece el partido.
   * Solo debe llamarse desde el panel del organizador cuando pulsa el botón
   * "Repartir premios".
   */
  async resolveForMatchOwned(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { round: { include: { tournament: true } } },
    });
    if (!match) throw new NotFoundException('Partido no encontrado');
    if (match.round.tournament.ownerId !== userId) {
      throw new ForbiddenException('No tienes permiso sobre este partido');
    }
    if (!match.played) {
      throw new BadRequestException('El partido todavía no tiene resultado');
    }

    const pending = await this.prisma.bet.count({
      where: { matchId, resolved: false },
    });
    if (pending === 0) {
      throw new BadRequestException('No hay apuestas pendientes en este partido');
    }

    await this.resolveForMatch(matchId);
    return { ok: true, resolved: pending };
  }
}