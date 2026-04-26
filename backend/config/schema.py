from pydantic import BaseModel


class LaborData(BaseModel):
    ilo_ref_area: str
    wdi_country_code: str
    informal_economy_pct: float


class EducationTaxonomy(BaseModel):
    levels: list[str]
    tvet_institutions: list[str]
    credential_label: str


class AutomationConfig(BaseModel):
    calibration_factor: float
    at_risk_threshold: float
    durable_threshold: float
    rationale: str


class InformalActivity(BaseModel):
    phrase: str
    hidden_skill_hints: list[str]


class WageBands(BaseModel):
    informal_minimum: int
    formal_entry: int
    skilled_trade: int
    digital_economy: int
    currency: str


class IntakePrompts(BaseModel):
    greeting: str
    language_question: str


class SectorInfo(BaseModel):
    name: str
    growth_rate: float
    ilo_code: str


class WdiIndicators(BaseModel):
    youth_unemployment: str
    employment_ratio: str
    gdp_per_capita: str


class CountryConfig(BaseModel):
    country_code: str
    country_name: str
    language: str
    currency: str
    currency_name: str
    flag_emoji: str
    region: str
    labor_data: LaborData
    education_taxonomy: EducationTaxonomy
    automation: AutomationConfig
    sector_vocabulary: list[str]
    informal_economy_activities: list[InformalActivity]
    opportunity_types: list[str]
    wage_bands: WageBands
    intake_prompts: IntakePrompts
    wdi_indicators: WdiIndicators
    top_sectors: list[SectorInfo]
