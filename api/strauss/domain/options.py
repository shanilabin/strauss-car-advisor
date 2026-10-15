"""The alternatives an employee can be shown: every catalog car and a waiver, minus what they have today."""

from strauss.config.bundle import ConfigBundle
from strauss.config.models import CatalogCar
from strauss.domain.eligibility import track_of
from strauss.domain.models import (
    CarArrangement,
    Option,
    OptionKind,
    Profile,
    Vehicle,
    VehicleKey,
    WaiverArrangement,
)

WAIVER_ID = "waiver"


def vehicle_from_catalog(car: CatalogCar, tax_year: int) -> Vehicle:
    """A catalog car as a Tax Authority vehicle. Its value of use was copied from the official file and is
    cross-checked against it by key in CI (strauss.config.check), so it equals the database value."""
    return Vehicle(
        key=VehicleKey(
            tax_year=tax_year,
            reg_year=car.reg_year,
            vehicle_type_code=car.vehicle_type_code,
            maker_code=car.maker_code,
            model_code=car.model_code,
        ),
        maker_name=car.maker_name,
        commercial_name=car.commercial_name,
        model_desc=car.model_desc,
        drive=car.drive,
        list_price=car.list_price,
        value_of_use=car.value_of_use,
    )


def car_label(car: CatalogCar) -> str:
    return f"{car.commercial_name} ({car.reg_year})"


def build_options(profile: Profile, bundle: ConfigBundle) -> list[Option]:
    current = profile.current
    options: list[Option] = []
    if not isinstance(current, WaiverArrangement):
        options.append(Option(id=WAIVER_ID, kind=OptionKind.WAIVER, label="ויתור על הרכב"))
    current_id = current.catalog_id if isinstance(current, CarArrangement) else None
    for car in bundle.catalog:
        if car.id == current_id:
            continue  # today's car is the baseline, not an alternative
        track = track_of(car, bundle)
        options.append(
            Option(
                id=car.id,
                kind=OptionKind.SPECIAL_TRACK if track else OptionKind.CATALOG_CAR,
                label=car_label(car),
                catalog_id=car.id,
                track_id=track.id if track else None,
                drive=car.drive,
            )
        )
    return options
