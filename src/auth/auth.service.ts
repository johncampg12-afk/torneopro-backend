import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  // ═══════════════════════════════════════════════════════
  // REGISTER
  // ═══════════════════════════════════════════════════════
  async register(dto: any) {
    // Email duplicado
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingEmail) throw new ConflictException('Este email ya está registrado');

    // Username duplicado
    if (dto.username) {
      const existingUsername = await this.prisma.user.findUnique({
        where: { username: dto.username },
      });
      if (existingUsername) throw new ConflictException('Este usuario ya está en uso');
    }

    // ¿El username está reservado para un organizador?
    const reservedUsernames = [
      process.env.ORGANIZER_1_USER,
      process.env.ORGANIZER_2_USER,
    ].filter(Boolean);
    const isReserved = dto.username && reservedUsernames.includes(dto.username);
    if (isReserved && dto.role !== 'organizer') {
      throw new ConflictException('Este usuario está reservado');
    }

    // Verificar rol organizer
    let finalRole = 'user';
    if (dto.role === 'organizer') {
      if (!dto.organizer_token) {
        throw new UnauthorizedException('Token de organizador requerido');
      }
      try {
        const payload: any = this.jwtService.verify(dto.organizer_token);
        if (payload.role !== 'organizer_access') {
          throw new UnauthorizedException('Token de organizador inválido');
        }
        finalRole = 'organizer';
      } catch {
        throw new UnauthorizedException('Token de organizador inválido o expirado');
      }
    }

    const hash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hash,
        name: dto.name,
        username: dto.username || null,
        age: dto.age ? parseInt(dto.age) : null,
        role: finalRole,
      },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        age: true,
        avatar: true,
        role: true,
        createdAt: true,
      },
    });

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return { user, token };
  }

  // ═══════════════════════════════════════════════════════
  // LOGIN
  // ═══════════════════════════════════════════════════════
  async login(dto: { email: string; password: string }) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        age: user.age,
        avatar: user.avatar,
        role: user.role,
      },
      token,
    };
  }

  // ═══════════════════════════════════════════════════════
  // VERIFY ORGANIZER (usuario + contraseña compartida)
  // ═══════════════════════════════════════════════════════
  async verifyOrganizer(user: string, password: string) {
    const expected = this.matchOrganizer(user, password);
    if (!expected) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    // Token temporal de 5 minutos
    const token = this.jwtService.sign(
      { role: 'organizer_access', slot: expected.slot, user: expected.user },
      { expiresIn: '5m' },
    );
    return { ok: true, token, slot: expected.slot };
  }

  private matchOrganizer(
    user: string,
    password: string,
  ): { slot: string; user: string } | null {
    const accounts = [
      {
        slot: 'organizer_1',
        user: process.env.ORGANIZER_1_USER,
        pass: process.env.ORGANIZER_1_PASSWORD,
      },
      {
        slot: 'organizer_2',
        user: process.env.ORGANIZER_2_USER,
        pass: process.env.ORGANIZER_2_PASSWORD,
      },
    ];

    const match = accounts.find(
      a => a.user && a.pass && a.user === user && a.pass === password,
    );
    return match ? { slot: match.slot, user: match.user! } : null;
  }
}