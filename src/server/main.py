import os
import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
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
from server.routes.batch_assessment import router as batch_router
from server.routes.recommendations import router as recommendations_router

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
app.include_router(batch_router)
app.include_router(recommendations_router)


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


# Serve React build in production. Mount /assets and known root-level static files
# directly, then fall back to index.html so React Router handles client-side routes
# like /map, /district/<id>, /workspace.
_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "client", "dist"))
if os.path.exists(_dist):
    _assets = os.path.join(_dist, "assets")
    if os.path.isdir(_assets):
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        # API 404s should look like API 404s, not the SPA shell.
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        # If a real file exists under client/dist/ (favicon, geojson, etc), serve it.
        candidate = os.path.normpath(os.path.join(_dist, full_path))
        if candidate.startswith(_dist) and os.path.isfile(candidate):
            return FileResponse(candidate)
        # Otherwise hand React Router the SPA shell.
        return FileResponse(os.path.join(_dist, "index.html"))

    LOGGER.info(f"startup | serving SPA from {_dist}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("DATABRICKS_APP_PORT", 8000))
    uvicorn.run("server.main:app", host="0.0.0.0", port=port, reload=False)
