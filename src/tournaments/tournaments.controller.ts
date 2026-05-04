import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TournamentsService } from './tournaments.service';
import {
  IsString, IsOptional, IsBoolean, IsArray, ValidateNested, IsEnum
} from 'class-validator';
import { Type } from 'class-transformer';

// DTO anidado para cada equipo
class TeamDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  color?: string;
}

export class CreateTournamentDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsEnum(['futbol', 'futsal', 'basket', 'voley', 'esports', 'tenis', 'generico'])
  sport: string;

  @IsString()
  @IsEnum(['liga', 'eliminatoria', 'grupos'])
  format: string;

  @IsBoolean()
  @IsOptional()
  doubleRound?: boolean;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamDto)
  teams: TeamDto[];
}

export class UpdateTournamentDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @IsEnum(['draft', 'active', 'finished'])
  status?: string;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  location?: string;
}

@Controller('tournaments')
export class TournamentsController {
  constructor(private tournamentsService: TournamentsService) {}

  @Get('public')
  async findPublic(@Query('search') search?: string) {
    return this.tournamentsService.findPublic(search);
  }

  @Get('public/:shareCode')
  async findByShareCode(@Param('shareCode') shareCode: string) {
    return this.tournamentsService.findByShareCode(shareCode);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findMine(@Request() req, @Query('search') search?: string) {
    return this.tournamentsService.findByOwner(req.user.userId, search);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Request() req, @Body() dto: CreateTournamentDto) {
    return this.tournamentsService.create(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    return this.tournamentsService.findOne(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(@Param('id') id: string, @Request() req, @Body() dto: UpdateTournamentDto) {
    return this.tournamentsService.update(id, req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req) {
    return this.tournamentsService.delete(id, req.user.userId);
  }
}