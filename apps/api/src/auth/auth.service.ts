import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  type OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { LoginInput, RegisterInput, User } from '@coursecraft/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser, JwtPayload } from './auth.types.js';
import { hashPassword, verifyPassword } from './password.js';
import { JWT_AUDIENCE, JWT_ISSUER } from './session-cookie.js';

const PUBLIC_USER_FIELDS = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
} as const;
const INVALID_CREDENTIALS = 'Invalid email or password';

@Injectable()
export class AuthService implements OnModuleInit {
  /** Verified against when the email is unknown, so both failure paths take similar time. */
  private dummyHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hashPassword(randomBytes(32).toString('hex'));
  }

  /** Public sign-up always creates a STUDENT; admins are created by the seed or by an admin. */
  async register(input: RegisterInput): Promise<AuthUser> {
    const passwordHash = await hashPassword(input.password);
    try {
      return await this.prisma.user.create({
        data: { email: input.email, name: input.name, passwordHash, role: 'STUDENT' },
        select: PUBLIC_USER_FIELDS,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }
  }

  /** The same error for an unknown email and a wrong password (no account enumeration). */
  async login(input: LoginInput): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { ...PUBLIC_USER_FIELDS, passwordHash: true },
    });
    const valid = await verifyPassword(user?.passwordHash ?? this.dummyHash, input.password);
    if (!user || !valid) throw new UnauthorizedException(INVALID_CREDENTIALS);

    const { passwordHash: _omit, ...publicUser } = user;
    return publicUser;
  }

  signSession(user: AuthUser): Promise<string> {
    const payload: JwtPayload = { sub: user.id, role: user.role };
    return this.jwt.signAsync(payload, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
  }

  toPublicUser(user: AuthUser): User {
    return { ...user, createdAt: user.createdAt.toISOString() };
  }
}
