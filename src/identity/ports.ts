import type { User } from './model.ts';

export interface UserRepository {
  findByUsername(username: string): User | null;
  get(id: string): User | null;
  insert(user: User): void;
}
