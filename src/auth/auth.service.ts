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
    // Comprobar email duplicado
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingEmail) throw new ConflictException('Este email ya está registrado');

    // Comprobar username duplicado (si lo envían)
    if (dto.username) {
      const existingUsername = await this.prisma.user.findUnique({
        where: { username: dto.username },
      });
      if (existingUsername) throw new ConflictException('Este usuario ya está en uso');
    }

    // Validar rol organizer con token
    let finalRole = 'user';
    if (dto.role === 'organizer' && dto.organizer_token) {
      try {
        const payload: any = this.jwtService.verify(dto.organizer_token);
        if (payload.role === 'organizer_access') finalRole = 'organizer';
      } catch {
        // Token inválido o expirado → cae a 'user'
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
  // VERIFY ORGANIZER (contraseña compartida)
  // ═══════════════════════════════════════════════════════
  async verifyOrganizer(password: string) {
    const expected = process.env.ORGANIZER_PASSWORD;
    if (!expected) throw new UnauthorizedException('Acceso de organizador no configurado');
    if (password !== expected) throw new UnauthorizedException('Contraseña incorrecta');

    // Token temporal de 5 minutos
    const token = this.jwtService.sign(
      { role: 'organizer_access' },
      { expiresIn: '5m' },
    );
    return { ok: true, token };
  }

  // ═══════════════════════════════════════════════════════
  // SOCIAL LOGIN (Google u otros — opcional)
  // ═══════════════════════════════════════════════════════
  async socialLogin(dto: any) {
    // Si en algún momento se reactiva Google, aquí iría la verificación del token.
    // Por ahora, si llega aquí sin provider soportado, error.
    if (dto.provider !== 'google') {
      throw new BadRequestException('Proveedor no soportado');
    }

    // Placeholder — se implementará cuando se reactive Google OAuth
    throw new UnauthorizedException('Login social no disponible');
  }
}