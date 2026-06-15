import os
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
LOGGER = logging.getLogger(__name__)

from server.db import setup_app_schema
from server.routes.coverage import router as coverage_router
from server.routes.regions import router as regions_router
from server.routes.scenarios import router as scenarios_router
from server.routes.verify import router as verify_router
from server.routes.assessment import router as assessment_router

app = FastAPI(title="Disha API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(coverage_router)
app.include_router(regions_router)
app.include_router(scenarios_router)
app.include_router(verify_router)
app.include_router(assessment_router)


@app.on_event("startup")
async def on_startup():
    try:
        setup_app_schema()
        LOGGER.info("startup | DB schema ready")
    except Exception as e:
        LOGGER.warning(f"startup | DB schema setup failed (will retry on first request): {e}")


@app.get("/health")
def health():
    return {"status": "ok"}


# Serve React build in production
_dist = os.path.join(os.path.dirname(__file__), "..", "client", "dist")
if os.path.exists(_dist):
    app.mount("/", StaticFiles(directory=_dist, html=True), name="static")
    LOGGER.info(f"startup | serving static files from {_dist}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("DATABRICKS_APP_PORT", 8000))
    uvicorn.run("server.main:app", host="0.0.0.0", port=port, reload=False)
