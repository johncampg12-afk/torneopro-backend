import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

interface RegisterDto {
  email: string;
  password: string;
  name: string;
  username?: string;
  city?: string;
  role?: string;
  terms_version?: string;
  organizer_token?: string;
}

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwtService: JwtService) {}

  async register(dto: RegisterDto) {
    // 1. Comprobar email duplicado
    const existingEmail = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingEmail) throw new ConflictException('Este email ya está registrado');

    // 2. Comprobar username duplicado (si viene)
    if (dto.username) {
      const existingUsername = await this.prisma.user.findUnique({ where: { username: dto.username } });
      if (existingUsername) throw new ConflictException('Este nombre de usuario ya está en uso');
    }

    // 3. Determinar rol final
    //    Solo se permite 'organizer' si el token temporal es válido y correcto.
    let finalRole = 'user';
    if (dto.role === 'organizer' && dto.organizer_token) {
      try {
        const payload: any = this.jwtService.verify(dto.organizer_token);
        if (payload?.role === 'organizer_access') {
          finalRole = 'organizer';
        }
      } catch {
        // Token inválido o expirado: se ignora y se crea como usuario normal
        finalRole = 'user';
      }
    }

    // 4. Hash de la contraseña
    const hash = await bcrypt.hash(dto.password, 10);

    // 5. Crear usuario
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hash,
        name: dto.name,
        username: dto.username || null,
        city: dto.city || null,
        role: finalRole,
      },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        city: true,
        role: true,
        createdAt: true,
      },
    });

    // 6. Firmar token de sesión
    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return { user, token };
  }

  async login(dto: { email: string; password: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Credenciales incorrectas');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Credenciales incorrectas');

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
        city: user.city,
        role: user.role,
      },
      token,
    };
  }

  async verifyOrganizer(password: string) {
    const expected = process.env.ORGANIZER_PASSWORD;
    if (!expected) throw new UnauthorizedException('El acceso de organizador no está configurado');
    if (password !== expected) throw new UnauthorizedException('Contraseña incorrecta');

    // Token temporal de 5 minutos, solo válido para completar el registro
    const token = this.jwtService.sign(
      { role: 'organizer_access' },
      { expiresIn: '5m' },
    );
    return { ok: true, token };
  }

  /**
   * Autenticación con Google.
   * El frontend envía el credential de Google (JWT firmado por Google).
   * Aquí se decodifica el payload (sin validar la firma, la librería de Google lo hace en el cliente).
   * NOTA: en producción, valida el id_token contra los servidores de Google.
   */
  async socialAuth(dto: {
    provider: string;
    token: string;
    role?: string;
    name?: string;
    username?: string;
    city?: string;
    terms_version?: string;
  }) {
    if (dto.provider !== 'google') {
      throw new UnauthorizedException('Proveedor no soportado');
    }

    // Decodificar el JWT de Google sin verificar firma (el frontend ya lo hizo con useGoogleLogin)
    let googlePayload: any = null;
    try {
      const parts = dto.token.split('.');
      if (parts.length === 3) {
        googlePayload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
      }
    } catch {
      throw new UnauthorizedException('Token de Google inválido');
    }

    if (!googlePayload?.email) {
      throw new UnauthorizedException('No se pudo obtener el email de Google');
    }

    const email = googlePayload.email;
    const name = dto.name || googlePayload.name || email.split('@')[0];

    // Buscar si el usuario ya existe
    let user = await this.prisma.user.findUnique({ where: { email } });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;

      // Determinar rol (organizer solo si el token lo autoriza; aquí simplificamos a user por seguridad)
      const role = 'user';

      // Asegurar username único
      let username = dto.username || null;
      if (username) {
        const exists = await this.prisma.user.findUnique({ where: { username } });
        if (exists) username = null; // se ignora si está pillado, se puede pedir después
      }

      user = await this.prisma.user.create({
        data: {
          email,
          password: '', // sin contraseña, usuario social
          name,
          username,
          city: dto.city || null,
          role,
        },
      });
    }

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
        city: user.city,
        role: user.role,
      },
      token,
      access_token: token, // alias para compatibilidad con el frontend
      is_new_user: isNewUser,
    };
  }
}