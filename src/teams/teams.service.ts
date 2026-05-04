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
