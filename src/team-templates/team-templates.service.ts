import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeamTemplatesService {
  constructor(private prisma: PrismaService) {}

  async findAllByUser(userId: string) {
    return this.prisma.teamTemplate.findMany({
      where: { userId },
      include: { players: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async importPlayersToTeam(templateId: string, teamId: string, userId: string) {
    // Verificar que la plantilla pertenezca al usuario
    const template = await this.prisma.teamTemplate.findUnique({ where: { id: templateId } });
    if (!template || template.userId !== userId) throw new ForbiddenException('Plantilla no válida');

    // Verificar que el equipo pertenezca a un torneo del usuario
    const team = await this.prisma.team.findUnique({ where: { id: teamId }, include: { tournament: true } });
    if (!team || team.tournament.ownerId !== userId) throw new ForbiddenException('No autorizado');

    // Obtener los jugadores de la plantilla y crearlos en el equipo real
    const players = await this.prisma.playerTemplate.findMany({ where: { teamTemplateId: templateId } });
    
    for (const pt of players) {
      await this.prisma.player.create({
        data: {
          name: pt.name,
          number: pt.number,
          teamId: team.id,
        },
      });
    }

    return { imported: players.length };
  }

  async create(userId: string, dto: { name: string; color?: string; logo?: string; players: { name: string; number?: number }[] }) {
    return this.prisma.teamTemplate.create({
      data: {
        name: dto.name,
        color: dto.color || '#3b82f6',
        logo: dto.logo || null,
        userId,
        players: {
          create: dto.players.map(p => ({ name: p.name, number: p.number ?? null })),
        },
      },
      include: { players: true },
    });
  }

  async delete(id: string, userId: string) {
    const template = await this.prisma.teamTemplate.findUnique({ where: { id } });
    if (!template || template.userId !== userId) throw new ForbiddenException('No autorizado');
    await this.prisma.teamTemplate.delete({ where: { id } });
  }
}