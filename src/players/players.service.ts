import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlayersService {
  constructor(private prisma: PrismaService) {}

  async create(teamId: string, userId: string, dto: { name: string; number?: number }) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId }, include: { tournament: true } });
    if (!team) throw new NotFoundException('Team not found');
    if (team.tournament.ownerId !== userId) throw new ForbiddenException('Not your tournament');

    return this.prisma.player.create({
      data: {
        name: dto.name,
        number: dto.number ?? null,
        teamId: team.id,
      },
    });
  }

  async findByTeam(teamId: string) {
    return this.prisma.player.findMany({
      where: { teamId },
      orderBy: { name: 'asc' },
    });
  }

  async update(id: string, userId: string, dto: { name?: string; number?: number }) {
    const player = await this.prisma.player.findUnique({
      where: { id },
      include: { team: { include: { tournament: true } } },
    });
    if (!player) throw new NotFoundException('Player not found');
    if (player.team.tournament.ownerId !== userId) throw new ForbiddenException('Not your tournament');

    return this.prisma.player.update({
      where: { id },
      data: { ...dto },
    });
  }

  async delete(id: string, userId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id },
      include: { team: { include: { tournament: true } } },
    });
    if (!player) throw new NotFoundException('Player not found');
    if (player.team.tournament.ownerId !== userId) throw new ForbiddenException('Not your tournament');

    await this.prisma.player.delete({ where: { id } });
    return { deleted: true };
  }
}