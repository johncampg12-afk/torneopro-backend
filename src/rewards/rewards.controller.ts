import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RewardsService } from './rewards.service';

@Controller('redemptions')
export class RewardsController {
  constructor(private rewardsService: RewardsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async redeem(@Request() req, @Body() dto: any) {
    return this.rewardsService.redeem(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  async my(@Request() req) {
    return this.rewardsService.myRedemptions(req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('organizer')
  @Get('all')
  async all(@Query('status') status?: string) {
    return this.rewardsService.listAll(status);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('organizer')
  @Get('stats')
  async stats() {
    return this.rewardsService.stats();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('organizer')
  @Patch(':id/complete')
  async complete(@Param('id') id: string) {
    return this.rewardsService.complete(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('organizer')
  @Patch(':id/cancel')
  async cancel(@Param('id') id: string) {
    return this.rewardsService.cancel(id);
  }
}