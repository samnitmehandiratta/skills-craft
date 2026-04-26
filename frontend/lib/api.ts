import type {
  Country, SkillProfile, RiskAssessment, ResilienceRecommendation,
  Projections, Opportunity, LaborSignals, DemoProfile,
  CheatSignals, StartInterviewResponse, SubmitAnswerResponse,
  ValidationResult, TranscribeResponse, DocumentUploadResponse,
  AuthUser, SavedProfile, RecruiterMatchResponse, RecruiterCandidateDetail, RecruiterShortlistItem,
} from "./types";
import { getRecruiterToken } from "./recruiterAuth";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function _throw(res: Response): Promise<never> {
  const err = await res.json().catch(() => ({ detail: res.statusText }));
  throw new ApiError(res.status, err.detail || "Request failed");
}

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) await _throw(res);
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) await _throw(res);
  return res.json();
}

function authHeader(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("unmapped_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function authedPost<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(body),
  });
  if (!res.ok) await _throw(res);
  return res.json();
}

async function authedGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeader() });
  if (!res.ok) await _throw(res);
  return res.json();
}

async function authedPut<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(body),
  });
  if (!res.ok) await _throw(res);
  return res.json();
}

// Multipart form — do NOT set Content-Type (browser sets it with boundary)
async function postForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", body: form });
  if (!res.ok) await _throw(res);
  return res.json();
}

export const api = {
  getCountries: () => get<Country[]>("/api/v1/countries"),

  startIntake: (country_code: string) =>
    post<{ session_id: string; first_question: string; total_questions: number }>(
      "/api/v1/skills/intake/start", { country_code, language: "en" }
    ),

  respondIntake: (session_id: string, user_message: string) =>
    post<{ next_question: string | null; is_complete: boolean; turn: number; total_questions: number }>(
      "/api/v1/skills/intake/respond", { session_id, user_message }
    ),

  buildProfile: (session_id: string) =>
    post<SkillProfile>("/api/v1/skills/build-profile", { session_id }),

  storeProfile: (session_id: string, profile: object) =>
    post<{ ok: boolean }>("/api/v1/skills/store-profile", { session_id, profile }),

  getProfile: (session_id: string) =>
    get<SkillProfile>(`/api/v1/skills/profile/${session_id}`),

  assessRisk: (session_id: string, country_code: string, skills?: object[]) =>
    post<RiskAssessment>("/api/v1/risk/assess", { session_id, country_code, ...(skills ? { skills } : {}) }),

  getResilience: (session_id: string) =>
    get<{ recommendations: ResilienceRecommendation[] }>(`/api/v1/risk/resilience/${session_id}`),

  getProjections: (country_code: string) =>
    get<Projections>(`/api/v1/risk/projections/${country_code}`),

  matchOpportunities: (session_id: string, country_code: string, risk_assessment?: object[]) =>
    post<{ opportunities: Opportunity[]; labor_signals: LaborSignals }>(
      "/api/v1/opportunities/match", { session_id, country_code, ...(risk_assessment ? { risk_assessment } : {}) }
    ),

  getLaborSignals: (country_code: string) =>
    get<{ ilo_data: LaborSignals; wdi_data: LaborSignals; top_sectors: object[] }>(
      `/api/v1/opportunities/labor-signals/${country_code}`
    ),

  getDashboard: (country_code: string) =>
    get<object>(`/api/v1/opportunities/dashboard/aggregate/${country_code}`),

  getDemoProfile: (profile_name: string) =>
    get<DemoProfile>(`/api/v1/opportunities/demo-profile/${profile_name}`),

  // ── Validation Flow ────────────────────────────────────────────────────────

  uploadDocument: (file: File, countryCode: string, sessionId?: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("country_code", countryCode);
    if (sessionId) form.append("session_id", sessionId);
    return postForm<DocumentUploadResponse>("/api/v1/validation/upload-document", form);
  },

  startValidationInterview: (sessionId: string, claimedSkills: string[], countryCode: string) =>
    post<StartInterviewResponse>("/api/v1/validation/interview/start", {
      session_id: sessionId,
      claimed_skills: claimedSkills,
      country_code: countryCode,
    }),

  submitValidationAnswer: (
    validationSessionId: string,
    answerText: string,
    cheatSignals: CheatSignals,
  ) =>
    post<SubmitAnswerResponse>("/api/v1/validation/interview/answer", {
      validation_session_id: validationSessionId,
      answer_text: answerText,
      cheat_signals: cheatSignals,
    }),

  getValidationResult: (validationSessionId: string) =>
    get<ValidationResult>(`/api/v1/validation/interview/result/${validationSessionId}`),

  transcribeAudio: (audioBlob: Blob, validationSessionId: string) => {
    const form = new FormData();
    form.append("audio", audioBlob, "recording.webm");
    form.append("validation_session_id", validationSessionId);
    return postForm<TranscribeResponse>("/api/v1/validation/interview/transcribe", form);
  },

  // ── Auth ──────────────────────────────────────────────────────────────────

  sendOtp: (phone: string) =>
    post<{ ok: boolean }>("/api/v1/auth/send-otp", { phone }),

  verifyOtp: (phone: string, otp: string) =>
    post<{ token: string; user: AuthUser; is_new_user: boolean }>(
      "/api/v1/auth/verify-otp", { phone, otp }
    ),

  getMe: () =>
    authedGet<{ user: AuthUser; profiles: SavedProfile[] }>("/api/v1/auth/me"),

  updateMe: (data: { name?: string; dob?: string; gender?: string; country_code?: string }) =>
    authedPut<{ user: AuthUser }>("/api/v1/auth/me", data),

  saveProfile: (session_id: string, profile_json: string, validation_json?: string) =>
    authedPost<{ ok: boolean; profile: SavedProfile }>("/api/v1/auth/save-profile", {
      session_id, profile_json, ...(validation_json ? { validation_json } : {}),
    }),

  getProfiles: () =>
    authedGet<{ profiles: SavedProfile[] }>("/api/v1/auth/profiles"),

  // ── Recruiter (password-gated for now) ───────────────────────────────────
  recruiterLogin: (password: string) =>
    post<{ token: string }>("/api/v1/recruiter/login", { password }),

  recruiterMatch: (data: {
    posted_skills: string[];
    country_code?: string;
    min_rating?: number;
    limit?: number;
    include_hidden?: boolean;
    only_matched?: boolean;
  }) => {
    const token = getRecruiterToken();
    if (!token) return Promise.reject(new ApiError(401, "Recruiter login required."));

    const { posted_skills, country_code, min_rating, limit, include_hidden, only_matched } = data;

    return fetch(`${BASE}/api/v1/recruiter/match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        posted_skills,
        ...(country_code ? { country_code } : {}),
        ...(typeof min_rating === "number" ? { min_rating } : {}),
        ...(typeof limit === "number" ? { limit } : {}),
        ...(typeof include_hidden === "boolean" ? { include_hidden } : {}),
        ...(typeof only_matched === "boolean" ? { only_matched } : {}),
      }),
    }).then(async (res) => {
      if (!res.ok) await _throw(res);
      return res.json() as Promise<RecruiterMatchResponse>;
    });
  },

  recruiterGetCandidate: (session_id: string) => {
    const token = getRecruiterToken();
    if (!token) return Promise.reject(new ApiError(401, "Recruiter login required."));
    return fetch(`${BASE}/api/v1/recruiter/candidate/${encodeURIComponent(session_id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (res) => {
      if (!res.ok) await _throw(res);
      return res.json() as Promise<RecruiterCandidateDetail>;
    });
  },

  recruiterShortlistList: () => {
    const token = getRecruiterToken();
    if (!token) return Promise.reject(new ApiError(401, "Recruiter login required."));
    return fetch(`${BASE}/api/v1/recruiter/shortlist`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (res) => {
      if (!res.ok) await _throw(res);
      return res.json() as Promise<{ items: RecruiterShortlistItem[] }>;
    });
  },

  recruiterShortlistAdd: (session_id: string, notes?: string) => {
    const token = getRecruiterToken();
    if (!token) return Promise.reject(new ApiError(401, "Recruiter login required."));
    return fetch(`${BASE}/api/v1/recruiter/shortlist/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ session_id, ...(notes ? { notes } : {}) }),
    }).then(async (res) => {
      if (!res.ok) await _throw(res);
      return res.json() as Promise<{ item: RecruiterShortlistItem }>;
    });
  },

  recruiterShortlistRemove: (session_id: string) => {
    const token = getRecruiterToken();
    if (!token) return Promise.reject(new ApiError(401, "Recruiter login required."));
    return fetch(`${BASE}/api/v1/recruiter/shortlist/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ session_id }),
    }).then(async (res) => {
      if (!res.ok) await _throw(res);
      return res.json() as Promise<{ ok: boolean }>;
    });
  },
};
