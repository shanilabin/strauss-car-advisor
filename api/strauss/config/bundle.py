"""The validated config bundle the engine receives: rules + catalog + occupations + fingerprint."""

from dataclasses import dataclass

from strauss.config.models import CatalogCar, Occupation
from strauss.config.schema import Rules


@dataclass(frozen=True)
class ConfigBundle:
    rules: Rules
    catalog: tuple[CatalogCar, ...]
    occupations: tuple[Occupation, ...]
    config_hash: str

    def catalog_car(self, car_id: str) -> CatalogCar:
        for car in self.catalog:
            if car.id == car_id:
                return car
        raise KeyError(car_id)

    def occupation(self, name: str) -> Occupation:
        for occ in self.occupations:
            if occ.name == name:
                return occ
        raise KeyError(name)
