import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RewardsService {
  constructor(private prisma: PrismaService) {}

  // ═══════════ CATÁLOGO ═══════════

  async findAll() {
    const rewards = await this.prisma.reward.findMany({
      where: { active: true, sponsor: { active: true } },
      include: { sponsor: { select: { id: true, name: true, logo: true } } },
      orderBy: [{ tier: 'asc' }, { cost: 'asc' }],
    });
    return rewards;
  }

  async findOne(id: string) {
    const reward = await this.prisma.reward.findUnique({
      where: { id },
      include: { sponsor: true },
    });
    if (!reward) throw new NotFoundException('Premio no encontrado');
    return reward;
  }

  // ═══════════ CANJE ═══════════

  async redeem(userId: string, rewardId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (!user.phone) {
      throw new BadRequestException('Necesitas añadir un teléfono en tu perfil antes de canjear');
    }

    const reward = await this.prisma.reward.findUnique({
      where: { id: rewardId },
      include: { sponsor: true },
    });
    if (!reward || !reward.active) throw new NotFoundException('Premio no disponible');

    if (user.coins < reward.cost) {
      throw new BadRequestException('No tienes suficientes coins');
    }

    // Verificar stock
    if (reward.stock !== null) {
      const usedCount = await this.prisma.redemption.count({
        where: { rewardId, status: { not: 'cancelled' } },
      });
      if (usedCount >= reward.stock) {
        throw new BadRequestException('Este premio está agotado');
      }
    }

    // Verificar si ya lo canjeó antes en estado pendiente (1 por premio por usuario)
    const existing = await this.prisma.redemption.findFirst({
      where: { userId, rewardId, status: 'pending' },
    });
    if (existing) {
      throw new BadRequestException('Ya tienes un canje pendiente de este premio');
    }

    const [redemption, updatedUser] = await this.prisma.$transaction([
      this.prisma.redemption.create({
        data: {
          userId,
          rewardId,
          rewardTitle: reward.title,
          sponsorName: reward.sponsor.name,
          cost: reward.cost,
          contactName: user.name,
          contactEmail: user.email,
          contactPhone: user.phone,
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { coins: { decrement: reward.cost } },
      }),
    ]);

    return { redemption, coins: updatedUser.coins };
  }

  // ═══════════ MIS CANJES ═══════════

  async myRedemptions(userId: string) {
    return this.prisma.redemption.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ═══════════ ADMIN: TODOS LOS CANJES ═══════════

  async listAllRedemptions() {
    return this.prisma.redemption.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, username: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async completeRedemption(id: string) {
    const r = await this.prisma.redemption.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Canje no encontrado');
    if (r.status !== 'pending') throw new BadRequestException('Este canje ya está cerrado');
    return this.prisma.redemption.update({
      where: { id },
      data: { status: 'completed', completedAt: new Date() },
    });
  }

  async cancelRedemption(id: string) {
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

  // ═══════════ ADMIN: SPONSORS Y REWARDS ═══════════

  async createSponsor(data: any) {
    return this.prisma.sponsor.create({ data });
  }

  async updateSponsor(id: string, data: any) {
    return this.prisma.sponsor.update({ where: { id }, data });
  }

  async deleteSponsor(id: string) {
    await this.prisma.sponsor.delete({ where: { id } });
    return { deleted: true };
  }

  async createReward(data: any) {
    return this.prisma.reward.create({ data });
  }

  async updateReward(id: string, data: any) {
    return this.prisma.reward.update({ where: { id }, data });
  }

  async deleteReward(id: string) {
    await this.prisma.reward.delete({ where: { id } });
    return { deleted: true };
  }

  async listSponsors() {
    return this.prisma.sponsor.findMany({
      include: { _count: { select: { rewards: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async listRewardsAdmin() {
    return this.prisma.reward.findMany({
      include: { sponsor: true, _count: { select: { redemptions: true } } },
      orderBy: [{ tier: 'asc' }, { cost: 'asc' }],
    });
  }
}