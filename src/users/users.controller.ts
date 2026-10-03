import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
  @Patch('me')
  async updateMe(@Request() req, @Body() dto: any) {
    return this.usersService.updateMe(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/password')
  async changePassword(
    @Request() req,
    @Body() dto: { currentPassword: string; newPassword: string },
  ) {
    return this.usersService.changePassword(
      req.user.userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/delete')
  async deleteAccount(@Request() req) {
    return this.usersService.deleteAccount(req.user.userId);
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