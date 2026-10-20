"""Reading a payslip for the employee to confirm (ARCHITECTURE section 7: POST /v1/payslip/parse).

Nothing is saved here: the reading goes back to the screen, the employee checks and corrects it, and only
then is it saved to the conversation (PATCH /profile) - the same way as any detail they type.
"""

import base64
import binascii
import logging
from collections.abc import Callable

from pydantic_ai import BinaryContent
from pydantic_ai.exceptions import AgentRunError, FallbackExceptionGroup, ModelAPIError
from pydantic_ai.models import Model
from pydantic_ai.settings import ModelSettings
from pydantic_ai.usage import UsageLimits

from strauss.agent.models_chain import AgentUnavailable
from strauss.agent.payslip import PayslipReading, build_payslip_agent, only_printed, pdf_text
from strauss.errors import ApiError
from strauss.http.schemas import PayslipParseResponse
from strauss.services.turn import run_on_agent_loop

logger = logging.getLogger("strauss.payslip")

MAX_BYTES = 3 * 1024 * 1024  # a payslip is small; the request body (base64) stays under Vercel's limit
TYPES = {"application/pdf", "image/png", "image/jpeg", "image/webp"}
SETTINGS = ModelSettings(temperature=0, timeout=45)
LIMITS = UsageLimits(request_limit=3)


def unreadable(message: str) -> ApiError:
    return ApiError(422, "payslip_unreadable", message)


class PayslipService:
    def __init__(self, text_model: Callable[[], Model], vision_model: Callable[[], Model]) -> None:
        self._text_model = text_model
        self._vision_model = vision_model

    def parse(self, content_type: str, data_base64: str) -> PayslipParseResponse:
        if content_type not in TYPES:
            raise unreadable("אפשר להעלות PDF או תמונה (PNG, JPG, WEBP)")
        try:
            data = base64.b64decode(data_base64, validate=True)
        except (binascii.Error, ValueError):
            raise unreadable("הקובץ לא הגיע תקין. נסו להעלות שוב") from None
        if not data:
            raise unreadable("הקובץ ריק")
        if len(data) > MAX_BYTES:
            raise unreadable("הקובץ גדול מדי (עד 3MB). אפשר לצלם רק את העמוד הראשון")

        text = pdf_text(data) if content_type == "application/pdf" else None
        try:
            if text is not None:
                reading = self._read(self._text_model(), f"תלוש השכר (טקסט):\n{text}")
                reading, dropped = only_printed(reading, text)
                return _response(reading, "text", dropped)
            prompt: list[str | BinaryContent] = [
                "תלוש השכר מצורף.",
                BinaryContent(data=data, media_type=content_type),
            ]
            return _response(self._read(self._vision_model(), prompt), "image", [])
        except AgentUnavailable as exc:
            raise ApiError(
                503, "payslip_unavailable", "קריאת תלושים לא זמינה כרגע. אפשר למלא את הפרטים בשיחה"
            ) from exc
        except (ModelAPIError, FallbackExceptionGroup) as exc:
            logger.warning("no model read the payslip: %r", exc)
            raise ApiError(
                503, "payslip_unavailable", "הקריאה עמוסה כרגע. נסו שוב בעוד רגע, או מלאו את הפרטים בשיחה"
            ) from exc
        except AgentRunError as exc:
            logger.warning("the payslip could not be read: %r", exc)
            raise unreadable("לא הצלחנו לקרוא את התלוש. נסו קובץ ברור יותר, או מלאו את הפרטים בשיחה") from exc

    @staticmethod
    def _read(model: Model, prompt: str | list[str | BinaryContent]) -> PayslipReading:
        agent = build_payslip_agent()
        # the model clients belong to the one agent loop (see services.turn)
        result = run_on_agent_loop(
            agent.run(prompt, model=model, model_settings=SETTINGS, usage_limits=LIMITS)
        )
        return result.output


def _response(reading: PayslipReading, read_from: str, dropped: list[str]) -> PayslipParseResponse:
    return PayslipParseResponse(reading=reading, read_from=read_from, not_confirmed=dropped)
