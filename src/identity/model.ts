export const ROLES = ['student', 'driver', 'office'] as const;
export type Role = (typeof ROLES)[number];

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  passwordHash: string;
}

/** The authenticated caller, as carried in the session token. */
export interface Principal {
  userId: string;
  role: Role;
  displayName: string;
}

/** A verified session token: who is calling, and until when (epoch ms) the token is valid. */
export interface Session {
  principal: Principal;
  expiresAt: number;
}
