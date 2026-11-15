import math
import httpx
from fastapi import HTTPException
from ..config import settings

PLACES_URL = "https://places.googleapis.com/v1/places:searchNearby"


def haversine_km(lat1, lng1, lat2, lng2) -> float:
    r = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


KINDS = {"hospital": "hospital", "pharmacy": "pharmacy", "clinic": "doctor"}


def nearby_places(lat: float, lng: float, kind: str = "hospital", radius_m: int = 5000) -> list[dict]:
    if not settings.google_maps_api_key:
        raise HTTPException(503, "Nearby search needs GOOGLE_MAPS_API_KEY in backend/.env.")
    body = {
        "includedTypes": [KINDS[kind]], "maxResultCount": 10, "rankPreference": "DISTANCE",
        "locationRestriction": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": radius_m}},
    }
    headers = {
        "X-Goog-Api-Key": settings.google_maps_api_key,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.currentOpeningHours.openNow,places.googleMapsUri,places.rating",
    }
    try:
        r = httpx.post(PLACES_URL, json=body, headers=headers, timeout=10)
        r.raise_for_status()
    except httpx.HTTPError:
        raise HTTPException(502, "The maps service is unavailable right now. Call 112 in an emergency.")
    out = []
    for p in r.json().get("places", []):
        loc = p["location"]
        out.append({
            "name": p["displayName"]["text"], "address": p.get("formattedAddress"),
            "phone": p.get("nationalPhoneNumber"), "maps_url": p.get("googleMapsUri"),
            "open_now": p.get("currentOpeningHours", {}).get("openNow"), "rating": p.get("rating"),
            "lat": loc["latitude"], "lng": loc["longitude"],
            "distance_km": round(haversine_km(lat, lng, loc["latitude"], loc["longitude"]), 2),
        })
    return out


nearby_hospitals = lambda lat, lng, radius_m=5000: nearby_places(lat, lng, "hospital", radius_m)
