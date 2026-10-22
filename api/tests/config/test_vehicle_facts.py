"""The Ministry of Transport's facts about the catalog cars (api/config/vehicle-facts.json)."""

from strauss.config.loader import load_bundle, load_vehicle_facts


def test_every_fact_belongs_to_one_catalog_car() -> None:
    ids = [c.catalog_id for c in load_vehicle_facts().cars]
    assert len(ids) == len(set(ids))
    assert set(ids) <= {car.id for car in load_bundle().catalog}


def test_a_car_matched_by_its_full_key_has_its_own_row() -> None:
    """KONA EV 2026 (CAR-08); ATTO 3 shares BYD's codes with the 7-seat TANG - the model description wins."""
    facts = load_vehicle_facts()
    kona, atto = facts.for_car("CAR-08"), facts.for_car("CAR-10")
    assert kona is not None and (kona.seats, kona.safety_level, kona.fuel) == (5, 8, "חשמל")
    assert atto is not None and atto.seats == 5


def test_a_car_without_a_row_for_its_year_gets_no_facts() -> None:
    """The ministry has SANTA FE's model code for 2026 only; the catalog's car is 2025 - nothing borrowed."""
    assert load_vehicle_facts().for_car("CAR-20") is None


def test_the_source_is_named() -> None:
    source = load_vehicle_facts().source
    assert "משרד התחבורה" in source.name and source.url.startswith("https://data.gov.il/")
