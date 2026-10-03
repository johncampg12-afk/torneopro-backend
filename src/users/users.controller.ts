import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Request() req) {
    return this.usersService.findById(req.user.userId);
  }

  @Get('check-username')
  async checkUsername(@Query('username') username: string) {
    return this.usersService.checkUsername(username);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/daily-bonus')
  async dailyBonus(@Request() req) {
    return this.usersService.claimDailyBonus(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/confirm-adult')
  async confirmAdult(@Request() req) {
    return this.usersService.confirmAdult(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/phone')
  async updatePhone(@Request() req, @Body() dto: { phone: string }) {
    return this.usersService.updatePhone(req.user.userId, dto.phone);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/stats')
  async getMyStats(@Request() req) {
    return this.usersService.getMyStats(req.user.userId);
  }
}