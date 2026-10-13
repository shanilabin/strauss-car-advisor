"""FastAPI application: wires routers together. Business logic never lives here."""

from fastapi import FastAPI

from strauss import __version__
from strauss.http.routers import health

app = FastAPI(
    title="Strauss Car Advisor API",
    version=__version__,
    description="מנוע נטו, סוכן ושירותי נציג - יועץ הרכב של שטראוס",
)

app.include_router(health.router)
