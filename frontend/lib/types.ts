export interface Country {
  country_code: string;
  country_name: string;
  flag_emoji: string;
  region: string;
  language: string;
}

export interface Skill {
  skill: string;
  category: string;
  is_hidden: boolean;
  evidence?: string;
  source_activity?: string;
  confidence?: number;
  esco_label?: string;
  esco_uri?: string;
  bucket?: "AT_RISK" | "DURABLE" | "EMERGING";
  bucket_label?: string;
  bucket_color?: string;
  automation_score?: {
    matched_occupation: string | null;
    lmic_calibrated_probability: number;
    raw_probability: number | null;
    note?: string;
  };
}

export interface SkillProfile {
  profile_id: string;
  session_id: string;
  generated_at: string;
  country: { code: string; name: string; region: string };
  summary: string;
  skills: Skill[];
  skill_counts: { total: number; explicit: number; hidden: number };
  categories: Record<string, string[]>;
}

export interface RiskAssessment {
  session_id: string;
  assessed_skills: Skill[];
  summary: {
    total: number;
    at_risk: number;
    durable: number;
    emerging: number;
    at_risk_pct: number;
    durable_pct: number;
    overall_risk: "HIGH" | "MODERATE" | "LOW";
  };
  calibration_note: string;
  calibration_factor: number;
}

export interface ResilienceRecommendation {
  at_risk_skill: string;
  adjacent_skills: {
    skill: string;
    why_durable: string;
    how_to_learn: string;
    estimated_months: number;
  }[];
}

export interface Projections {
  country: string;
  years: number[];
  tertiary_education_pct: number[];
  secondary_education_pct: number[];
  youth_labor_force_growth: number[];
  key_insight: string;
}

export interface Opportunity {
  title: string;
  sector: string;
  sector_growth_rate: number;
  sector_growth_label: string;
  match_score: number;
  estimated_monthly_wage: number;
  wage_label: string;
  opportunity_type: string;
  matched_skills: string[];
  data_source: string;
}

export interface LaborSignals {
  youth_unemployment_rate: number;
  informal_employment_pct: number;
  gdp_per_capita_usd: number;
  human_capital_index: number;
}

export interface DemoProfile extends SkillProfile {
  persona: string;
  intake_transcript: { question: string; answer: string }[];
}

// ── Validation Flow ──────────────────────────────────────────────────────────

export interface CheatSignals {
  tab_switches: number;
  focus_losses: number;
  paste_events: number;
  answer_time_ms: number;
  gaze_away_seconds?: number;
}

export interface StartInterviewResponse {
  validation_session_id: string;
  first_question: string;
  skill_being_tested: string;
  question_number: number;
  total_questions: number;
  estimated_duration_minutes: number;
  claimed_skills: string[];
}

export interface SkillMapEntry {
  skill: string;
  avg_score: number;
  questions_asked: number;
  verdict: "PENDING" | "TESTING" | "STRONG" | "ADEQUATE" | "WEAK" | "FAIL";
  tone_confidence?: number;
}

export interface SubmitAnswerResponse {
  next_question: string | null;
  skill_being_tested: string | null;
  question_number: number;
  total_questions: number;
  is_complete: boolean;
  progress_pct: number;
  current_skill_running_score: number | null;
  skill_map: SkillMapEntry[];
  just_scored_skill: string | null;
  just_scored_verdict: string | null;
  terminated_early?: boolean;
}

export interface SkillScoreResult {
  skill: string;
  confidence: number;
  verdict: "VERIFIED" | "PARTIAL" | "UNVERIFIED";
  questions_asked: number;
  avg_score: number;
}

export interface ValidationCertificate {
  certificate_id: string;
  issued_at: string;
  subject: string;
  verdict_summary: string;
  integrity_note: string;
  version: string;
}

export interface HiddenSkillResult {
  skill: string;
  source_activity: string;
  confidence: number;
  category: string;
}

export interface ValidationResult {
  validation_session_id: string;
  skill_scores: SkillScoreResult[];
  overall_verdict: "VERIFIED" | "PARTIAL" | "UNVERIFIED";
  cheat_risk_score: number;
  cheat_risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  certificate: ValidationCertificate;
  generated_at: string;
  hidden_skills: HiddenSkillResult[];
}

export interface TranscribeResponse {
  transcript: string;
  ok: boolean;
  validation_session_id: string;
}

export interface DocumentUploadResponse extends SkillProfile {
  source: "document_upload";
  doc_type: "pdf" | "docx" | "image";
}

export interface AuthUser {
  id: number;
  phone: string;
  name: string | null;
  dob: string | null;
  gender: string | null;
  country_code: string | null;
  created_at: string;
}

export interface SavedProfile {
  id: number;
  user_id: number;
  session_id: string;
  profile_json: string;
  validation_json: string | null;
  created_at: string;
}

export interface RecruiterMatch {
  posted_skill: string;
  candidate_skill: string;
  score: number;
}

export interface RecruiterCandidate {
  profile_id?: string;
  session_id: string;
  name?: string;
  phone?: string;
  country?: string;
  summary?: string;
  rating: number;
  matched: RecruiterMatch[];
  missing: string[];
  skills_total: number;
  created_at: string;
}

export interface RecruiterMatchResponse {
  scanned: number;
  count: number;
  candidates: RecruiterCandidate[];
}

export interface RecruiterCandidateDetail {
  session_id: string;
  name?: string;
  phone?: string;
  country_code?: string;
  created_at: string;
  profile: SkillProfile;
  validation_json: string | null;
}

export interface RecruiterShortlistItem {
  id: number;
  session_id: string;
  notes: string | null;
  created_at: string;
}
