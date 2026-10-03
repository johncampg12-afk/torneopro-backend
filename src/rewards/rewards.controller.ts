import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RewardsService } from './rewards.service';

@Controller('rewards')
export class RewardsController {
  constructor(private rewardsService: RewardsService) {}

  // ─── Catálogo público ───
  @Get()
  async findAll() {
    return this.rewardsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.rewardsService.findOne(id);
  }

  // ─── Canjear (auth) ───
  @UseGuards(JwtAuthGuard)
  @Post(':id/redeem')
  async redeem(@Param('id') id: string, @Request() req) {
    return this.rewardsService.redeem(req.user.userId, id);
  }

  // ─── Admin: crear y gestionar sponsors y rewards ───
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('organizer')
  @Get('admin/sponsors')
  async listSponsors() {
    return this.rewardsService.listSponsors();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('organizer')
  @Post('admin/sponsors')
  async createSponsor(@Body() data: any) {
    return this.rewardsService.createSponsor(data);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('organizer')
  @Patch('admin/sponsors/:id')
  async updateSponsor(@Param('id') id: string, @Body() data: any) {
    return this.rewardsService.updateSponsor(id, data);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('organizer')
  @Delete('admin/sponsors/:id')
  async deleteSponsor(@Param('id') id: string) {
    return this.rewardsService.deleteSponsor(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('organizer')
  @Get('admin/rewards')
  async listRewards() {
    return this.rewardsService.listRewardsAdmin();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('organizer')
  @Post('admin/rewards')
  async createReward(@Body() data: any) {
    return this.rewardsService.createReward(data);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('organizer')
  @Patch('admin/rewards/:id')
  async updateReward(@Param('id') id: string, @Body() data: any) {
    return this.rewardsService.updateReward(id, data);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('organizer')
  @Delete('admin/rewards/:id')
  async deleteReward(@Param('id') id: string) {
    return this.rewardsService.deleteReward(id);
  }
}