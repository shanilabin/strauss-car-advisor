from fastapi import APIRouter

from strauss.http.auth import UserDep
from strauss.http.deps import PayslipServiceDep
from strauss.http.errors import ERROR_RESPONSES
from strauss.http.schemas import PayslipParseRequest, PayslipParseResponse

router = APIRouter(prefix="/v1/payslip", tags=["payslip"], responses=ERROR_RESPONSES)


@router.post("/parse")
def parse_payslip(
    body: PayslipParseRequest, _user: UserDep, service: PayslipServiceDep
) -> PayslipParseResponse:
    """Read a payslip (PDF or image) into profile fields, as printed - for the employee to confirm before
    anything is saved. The file is not stored, and the reading has no name, ID number or bank details.
    A PDF with text is read from its text and every number is checked against it; an image is read by a
    model that reads images. 422 'payslip_unreadable' / 503 'payslip_unavailable' -> fill in by chat."""
    return service.parse(body.content_type, body.data_base64)
