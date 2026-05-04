import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TournamentsService } from './tournaments.service';

export class CreateTournamentDto {
  name: string;
  description?: string;
  sport: string;
  format: string;
  doubleRound?: boolean;
  startDate?: string;
  location?: string;
  isPublic?: boolean;
  teams: { name: string; color?: string }[];
}

export class UpdateTournamentDto {
  name?: string;
  description?: string;
  status?: string;
  isPublic?: boolean;
  startDate?: string;
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