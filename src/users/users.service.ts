import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
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

  async confirmAdult(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isAdultConfirmed: true },
    });
    return { ok: true, isAdultConfirmed: user.isAdultConfirmed };
  }

  async updatePhone(userId: string, phone: string) {
    const cleanPhone = phone.trim().replace(/[^0-9+]/g, '');
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { phone: cleanPhone || null },
    });
    return { ok: true, phone: user.phone };
  }

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
      bets: { won, lost, pending, total: bets.length, winRate },
      redemptions,
    };
  }

  /**
   * Actualiza los datos editables del usuario (no email, no username).
   */
  async updateMe(
    userId: string,
    dto: { name?: string; age?: number; phone?: string; avatar?: string },
  ) {
    const data: any = {};

    if (dto.name !== undefined) {
      const n = dto.name.trim();
      if (n.length < 2) throw new BadRequestException('El nombre debe tener al menos 2 caracteres');
      data.name = n;
    }

    if (dto.age !== undefined) {
      const age = parseInt(String(dto.age));
      if (isNaN(age) || age < 13 || age > 99) {
        throw new BadRequestException('La edad debe estar entre 13 y 99');
      }
      data.age = age;
    }

    if (dto.phone !== undefined) {
      const clean = dto.phone.trim().replace(/[^0-9+]/g, '');
      data.phone = clean || null;
    }

    if (dto.avatar !== undefined) {
      if (dto.avatar && dto.avatar.length > 3_000_000) {
        throw new BadRequestException('La imagen es demasiado grande');
      }
      data.avatar = dto.avatar || null;
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
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
        createdAt: true,
      },
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new BadRequestException('Contraseña actual incorrecta');

    if (newPassword.length < 8) {
      throw new BadRequestException('La nueva contraseña debe tener al menos 8 caracteres');
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hash },
    });

    return { ok: true };
  }

  async deleteAccount(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (user.role === 'organizer') {
      throw new ForbiddenException('Los organizadores no pueden eliminar su cuenta');
    }

    await this.prisma.user.delete({ where: { id: userId } });
    return { ok: true };
  }
}