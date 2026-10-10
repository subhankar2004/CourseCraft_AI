import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  type LoginInput,
  loginSchema,
  type RegisterInput,
  registerSchema,
  type Session,
  type User,
} from '@coursecraft/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { Env } from '../config/env.js';
import { CurrentUser, Public } from './auth.decorators.js';
import { AuthService } from './auth.service.js';
import type { AuthUser } from './auth.types.js';
import { SESSION_COOKIE, sessionCookieOptions } from './session-cookie.js';

const MINUTE = 60_000;

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Post('register')
  @Throttle({ auth: { limit: 5, ttl: 60 * MINUTE } }) // 5 sign-ups per IP per hour
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<User> {
    const user = await this.auth.register(body);
    await this.startSession(user, res);
    return this.auth.toPublicUser(user);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 5, ttl: MINUTE } }) // brute-force protection: 5 attempts per IP per minute
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<User> {
    const user = await this.auth.login(body);
    await this.startSession(user, res);
    return this.auth.toPublicUser(user);
  }

  /** Public so a stale or expired cookie can always be cleared. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response): void {
    const { maxAge: _maxAge, ...options } = this.cookieOptions();
    res.clearCookie(SESSION_COOKIE, options);
  }

  /**
   * Who is signed in, for the web app. Always 200: `{ user: null }` when signed out, so ordinary
   * signed-out page views don't log 401 errors in the browser. `/auth/me` keeps its strict 401.
   */
  @Public()
  @Get('session')
  @SkipThrottle()
  async session(@Req() req: Request): Promise<Session> {
    const user = await this.auth.resolveSession(req.cookies?.[SESSION_COOKIE]);
    return { user: user ? this.auth.toPublicUser(user) : null };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): User {
    return this.auth.toPublicUser(user);
  }

  private async startSession(user: AuthUser, res: Response): Promise<void> {
    res.cookie(SESSION_COOKIE, await this.auth.signSession(user), this.cookieOptions());
  }

  private cookieOptions() {
    return sessionCookieOptions(
      this.config.get('NODE_ENV', { infer: true }) === 'production',
      this.config.get('JWT_EXPIRES_IN', { infer: true }),
    );
  }
}
