import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RewardsService } from './rewards.service';

@Controller('redemptions')
export class RedemptionsController {
  constructor(private rewardsService: RewardsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('my')
  async my(@Request() req) {
    return this.rewardsService.myRedemptions(req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('organizer')
  @Get('all')
  async all() {
    return this.rewardsService.listAllRedemptions();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('organizer')
  @Patch(':id/complete')
  async complete(@Param('id') id: string) {
    return this.rewardsService.completeRedemption(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('organizer')
  @Patch(':id/cancel')
  async cancel(@Param('id') id: string) {
    return this.rewardsService.cancelRedemption(id);
  }
}