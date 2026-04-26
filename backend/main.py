from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config.loader import load_all_configs, list_countries
from api.routes import skills, risk, opportunities, validation, auth, recruiter
from modules.auth.database import init_db

app = FastAPI(title="UNMAPPED API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(skills.router)
app.include_router(risk.router)
app.include_router(opportunities.router)
app.include_router(validation.router)
app.include_router(auth.router)
app.include_router(recruiter.router)


@app.on_event("startup")
def startup():
    load_all_configs()
    init_db()


@app.get("/")
def root():
    return {"status": "ok", "service": "UNMAPPED API"}


@app.get("/api/v1/countries")
def get_countries():
    return list_countries()
