import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BetsService } from './bets.service';

@Controller('bets')
export class BetsController {
  constructor(private betsService: BetsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async place(@Request() req, @Body() dto: { matchId: string; prediction: string; amount: number }) {
    return this.betsService.place(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  async my(@Request() req) {
    return this.betsService.findMine(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('unseen-count')
  async unseenCount(@Request() req) {
    return this.betsService.countUnseen(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mark-seen')
  async markSeen(@Request() req) {
    return this.betsService.markAllSeen(req.user.userId);
  }

  @Get('match/:matchId/stats')
  async stats(@Param('matchId') matchId: string) {
    return this.betsService.statsForMatch(matchId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('match/:matchId/mine')
  async mineForMatch(@Request() req, @Param('matchId') matchId: string) {
    return this.betsService.findMineForMatch(req.user.userId, matchId);
  }
}