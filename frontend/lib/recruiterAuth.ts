const RECRUITER_TOKEN_KEY = "recruiter_token";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getRecruiterToken(): string | null {
  return isBrowser() ? sessionStorage.getItem(RECRUITER_TOKEN_KEY) : null;
}

export function setRecruiterToken(token: string): void {
  if (isBrowser()) sessionStorage.setItem(RECRUITER_TOKEN_KEY, token);
}

export function clearRecruiterToken(): void {
  if (isBrowser()) sessionStorage.removeItem(RECRUITER_TOKEN_KEY);
}

export function isRecruiterLoggedIn(): boolean {
  return Boolean(getRecruiterToken());
}

