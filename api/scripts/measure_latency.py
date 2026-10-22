"""Latency of the live API, measured from outside (as a browser would see it). For the README.

    cd api
    uv run python scripts/measure_latency.py                      # https://strauss-api.vercel.app
    uv run python scripts/measure_latency.py https://other-host   # another deployment

The first call per endpoint warms the function and is reported separately (cold start); then N calls.
Only public, read-only endpoints and the stateless /v1/compare - nothing is written.
"""

import statistics
import sys
import time

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://strauss-api.vercel.app"
N = 20
ATTO_3 = {
    "tax_year": 2026,
    "reg_year": 2025,
    "vehicle_type_code": 1,
    "maker_code": "01014",
    "model_code": "00003",
}


def noa_profile(client: httpx.Client) -> dict[str, object]:
    samples = client.get("/v1/config").json()  # warm-up of config, and proof the bundle is live
    assert samples["version"]
    catalog = {c["id"]: c for c in client.get("/v1/catalog").json()}
    corolla = catalog["CAR-09"]
    vehicle = client.get(
        "/v1/vehicles/value-of-use",
        params={"tax_year": 2026, "reg_year": corolla["reg_year"], "vehicle_type_code": 1,
                "maker_code": corolla["maker_code"], "model_code": corolla["model_code"]},
    ).json()  # fmt: skip
    return {
        "occupation": "מנהל/ת מוצר",
        "salary": {"base": 18500, "commissions": 0, "bonus": 0},
        "deductions": {"pension_pct": 6, "study_fund_pct": 2.5, "credit_points": 2.75},
        "children_under_23": 2,
        "current": {"kind": "car", "vehicle": vehicle, "participation": 300},
    }


def main() -> None:
    with httpx.Client(base_url=BASE, timeout=30) as client:
        profile = noa_profile(client)
        calls = {
            "GET /health": lambda: client.get("/health"),
            "GET /v1/vehicles/search": lambda: client.get(
                "/v1/vehicles/search", params={"q": "corolla cross", "reg_year": 2025}
            ),
            "GET /v1/vehicles/value-of-use": lambda: client.get("/v1/vehicles/value-of-use", params=ATTO_3),
            "POST /v1/compare (20 options)": lambda: client.post("/v1/compare", json={"profile": profile}),
        }
        print(f"{BASE} · {N} calls each\n")
        print("| endpoint | first call | median | p95 |")
        print("|---|---|---|---|")
        for name, call in calls.items():
            started = time.perf_counter()
            first = call()
            first.raise_for_status()
            cold = (time.perf_counter() - started) * 1000
            times = []
            for _ in range(N):
                started = time.perf_counter()
                call().raise_for_status()
                times.append((time.perf_counter() - started) * 1000)
            times.sort()
            p95 = times[int(len(times) * 0.95) - 1]
            print(f"| `{name}` | {cold:.0f} ms | {statistics.median(times):.0f} ms | {p95:.0f} ms |")


if __name__ == "__main__":
    main()
