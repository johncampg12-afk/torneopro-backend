import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        age: true,
        avatar: true,
        phone: true,
        role: true,
        coins: true,
        totalCoinsEarned: true,
        isAdultConfirmed: true,
        lastDailyBonus: true,
        createdAt: true,
      },
    });
  }

  async checkUsername(username: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    return { available: !user };
  }

  /**
   * Reclama el bono diario de 100 coins.
   * Solo se puede reclamar una vez cada 24h.
   */
  async claimDailyBonus(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const now = new Date();
    const oneDay = 24 * 60 * 60 * 1000;

    if (user.lastDailyBonus && now.getTime() - user.lastDailyBonus.getTime() < oneDay) {
      return { granted: false, coins: user.coins };
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        coins: { increment: 100 },
        totalCoinsEarned: { increment: 100 },
        lastDailyBonus: now,
      },
    });

    return { granted: true, bonus: 100, coins: updated.coins };
  }

  /**
   * Marca al usuario como mayor de 18 años confirmado.
   * Requerido antes de poder apostar.
   */
  async confirmAdult(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isAdultConfirmed: true },
    });
    return { ok: true, isAdultConfirmed: user.isAdultConfirmed };
  }

  /**
   * Actualiza el teléfono del usuario (necesario para el canje de premios).
   */
  async updatePhone(userId: string, phone: string) {
    const cleanPhone = phone.trim().replace(/[^0-9+]/g, '');
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { phone: cleanPhone || null },
    });
    return { ok: true, phone: user.phone };
  }

  /**
   * Estadísticas personales del usuario para la página de perfil.
   */
  async getMyStats(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const bets = await this.prisma.bet.findMany({ where: { userId } });
    const won = bets.filter(b => b.won === true).length;
    const lost = bets.filter(b => b.won === false).length;
    const pending = bets.filter(b => !b.resolved).length;
    const totalResolved = won + lost;
    const winRate = totalResolved > 0 ? Math.round((won / totalResolved) * 100) : 0;

    const redemptions = await this.prisma.redemption.count({ where: { userId } });

    return {
      coins: user.coins,
      totalCoinsEarned: user.totalCoinsEarned,
      isAdultConfirmed: user.isAdultConfirmed,
      phone: user.phone,
      bets: {
        won,
        lost,
        pending,
        total: bets.length,
        winRate,
      },
      redemptions,
    };
  }
}