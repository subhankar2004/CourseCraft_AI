import type { Request } from 'express';
import type { Role } from '@coursecraft/shared';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
}

export interface JwtPayload {
  sub: string;
  role: Role;
}

export type AuthenticatedRequest = Request & { user: AuthUser };
