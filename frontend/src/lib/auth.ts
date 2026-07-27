/**
 * auth.ts — Client-side auth store for the Sentinel hackathon demo.
 * Credentials are hardcoded intentionally for demo purposes only.
 */

export type UserRole = "admin" | "demo";

export interface User {
  username: string;
  role: UserRole;
  displayName: string;
  initials: string;
  accountId?: string; // only for demo users
}

// ── Credential registry ──────────────────────────────────────────────────────
const USERS: Array<{ username: string; password: string; user: User }> = [
  {
    username: "admin",
    password: "admin",
    user: {
      username: "admin",
      role: "admin",
      displayName: "Security Admin",
      initials: "SA",
    },
  },
  {
    username: "adhi03",
    password: "adhi03",
    user: {
      username: "adhi03",
      role: "demo",
      displayName: "Adhi Kumar",
      initials: "AK",
      accountId: "acc_123",
    },
  },
  {
    username: "tara05",
    password: "tara05",
    user: {
      username: "tara05",
      role: "demo",
      displayName: "Tara Williams",
      initials: "TW",
      accountId: "acc_tara",
    },
  },
];

const STORAGE_KEY = "sentinel_user";

// ── Public helpers ───────────────────────────────────────────────────────────

/** Attempt to log in. Returns the User on success or null on failure. */
export function login(username: string, password: string): User | null {
  const match = USERS.find(
    (u) => u.username === username && u.password === password,
  );
  if (!match) return null;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(match.user));
  return match.user;
}

/** Returns the currently logged-in user, or null if not authenticated. */
export function getUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

/** Log out the current user. */
export function logout(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** True if there is a currently authenticated user. */
export function isAuthenticated(): boolean {
  return getUser() !== null;
}
