"""FastAPI application: wires routers together. Business logic never lives here."""

from fastapi import FastAPI
from fastapi.routing import APIRoute

from strauss import __version__
from strauss.http.errors import install_error_handlers
from strauss.http.routers import compare, config, conversations, health, payslip, rep, vehicles


def _operation_id(route: APIRoute) -> str:
    """Stable, readable operation ids (e.g. conversations_send_message) for the generated client."""
    return f"{route.tags[0]}_{route.name}" if route.tags else route.name


app = FastAPI(
    title="Strauss Car Advisor API",
    version=__version__,
    description="מנוע נטו, סוכן ושירותי נציג - יועץ הרכב של שטראוס",
    generate_unique_id_function=_operation_id,
)

install_error_handlers(app)

for module in (health, conversations, compare, vehicles, config, rep, payslip):
    app.include_router(module.router)
