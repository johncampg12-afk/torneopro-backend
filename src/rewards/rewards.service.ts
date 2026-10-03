import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RewardsService {
  constructor(private prisma: PrismaService) {}

  async redeem(
    userId: string,
    dto: { rewardId: string; rewardTitle: string; sponsorName: string; cost: number },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (!user.phone) {
      throw new BadRequestException('Añade un teléfono en tu perfil antes de canjear');
    }

    if (!dto.rewardId || !dto.rewardTitle || !dto.sponsorName || !dto.cost) {
      throw new BadRequestException('Datos del premio incompletos');
    }

    if (user.coins < dto.cost) {
      throw new BadRequestException('No tienes suficientes coins');
    }

    // Un canje pendiente por premio y usuario
    const existing = await this.prisma.redemption.findFirst({
      where: { userId, rewardId: dto.rewardId, status: 'pending' },
    });
    if (existing) {
      throw new BadRequestException('Ya tienes un canje pendiente de este premio');
    }

    const [redemption, updatedUser] = await this.prisma.$transaction([
      this.prisma.redemption.create({
        data: {
          userId,
          rewardId: dto.rewardId,
          rewardTitle: dto.rewardTitle,
          sponsorName: dto.sponsorName,
          cost: dto.cost,
          contactName: user.name,
          contactEmail: user.email,
          contactPhone: user.phone,
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { coins: { decrement: dto.cost } },
      }),
    ]);

    return { redemption, coins: updatedUser.coins };
  }

  async myRedemptions(userId: string) {
    return this.prisma.redemption.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listAll(status?: string) {
    const where: any = {};
    if (status && status !== 'all') where.status = status;
    return this.prisma.redemption.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, username: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async complete(id: string) {
    const r = await this.prisma.redemption.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Canje no encontrado');
    if (r.status !== 'pending') throw new BadRequestException('Este canje ya está cerrado');
    return this.prisma.redemption.update({
      where: { id },
      data: { status: 'completed', completedAt: new Date() },
    });
  }

  async cancel(id: string) {
    const r = await this.prisma.redemption.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Canje no encontrado');
    if (r.status !== 'pending') throw new BadRequestException('Este canje ya está cerrado');

    const [updated] = await this.prisma.$transaction([
      this.prisma.redemption.update({
        where: { id },
        data: { status: 'cancelled', completedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: r.userId },
        data: { coins: { increment: r.cost } },
      }),
    ]);
    return updated;
  }

  async stats() {
    const [total, pending, completed, cancelled, totalCoinsSpent] = await Promise.all([
      this.prisma.redemption.count(),
      this.prisma.redemption.count({ where: { status: 'pending' } }),
      this.prisma.redemption.count({ where: { status: 'completed' } }),
      this.prisma.redemption.count({ where: { status: 'cancelled' } }),
      this.prisma.redemption.aggregate({
        where: { status: { not: 'cancelled' } },
        _sum: { cost: true },
      }),
    ]);
    return {
      total,
      pending,
      completed,
      cancelled,
      totalCoinsSpent: totalCoinsSpent._sum.cost || 0,
    };
  }
}