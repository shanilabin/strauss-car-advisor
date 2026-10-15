"""The challenge's six fictitious employees as engine profiles (demo, tests and the reference check)."""

from strauss.config.bundle import ConfigBundle
from strauss.config.models import SampleCurrentCar, SampleEmployee
from strauss.domain.models import CarArrangement, ParticipationStatus, Profile, WaiverArrangement
from strauss.domain.options import vehicle_from_catalog


def to_profile(employee: SampleEmployee, bundle: ConfigBundle) -> Profile:
    current: CarArrangement | WaiverArrangement
    if isinstance(employee.current, SampleCurrentCar):
        car = bundle.catalog_car(employee.current.catalog_id)
        current = CarArrangement(
            vehicle=vehicle_from_catalog(car, bundle.rules.value_of_use.tax_year),
            catalog_id=car.id,
            participation=employee.current.participation,
            participation_status=ParticipationStatus.CONFIRMED,
        )
    else:
        current = WaiverArrangement(maintenance=employee.current.maintenance)
    return Profile(
        occupation=employee.occupation,
        salary=employee.salary,
        deductions=employee.deductions.to_domain(),
        children_under_23=employee.children_under_23,
        current=current,
    )
