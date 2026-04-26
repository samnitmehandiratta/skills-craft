const TOKEN_KEY = "unmapped_token";
const USER_KEY  = "unmapped_user";

export interface AuthUser {
  id: number;
  phone: string;
  name: string | null;
  dob: string | null;
  gender: string | null;
  country_code: string | null;
  created_at: string;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getToken(): string | null {
  return isBrowser() ? localStorage.getItem(TOKEN_KEY) : null;
}

export function setToken(token: string): void {
  if (isBrowser()) localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (isBrowser()) localStorage.removeItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  if (!isBrowser()) return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthUser; } catch { return null; }
}

export function setUser(user: AuthUser): void {
  if (isBrowser()) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearUser(): void {
  if (isBrowser()) localStorage.removeItem(USER_KEY);
}

export function isLoggedIn(): boolean {
  return Boolean(getToken());
}
