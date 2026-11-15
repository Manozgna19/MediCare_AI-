"""Deterministic safety layer. Runs BEFORE any LLM call so emergencies never depend on model behaviour."""
import re

MEDICAL = [
    r"chest (pain|pressure|tightness)", r"(can'?t|cannot|unable to) breathe", r"(difficulty|trouble) breathing",
    r"short(ness)? of breath", r"\bstroke\b", r"face (is )?droop", r"slurred speech", r"unconscious", r"not breathing",
    r"passed out", r"severe(ly)? bleeding", r"bleeding (a lot|heavily|badly)", r"\bseizure", r"overdos", r"poison",
    r"swallowed .*(pills|tablets|bleach|poison)", r"heart attack",
    "सीने में दर्द", "सांस नहीं", "सांस लेने में तकलीफ", "बेहोश", "दौरा पड़",
    "ఛాతీ నొప్పి", "ఊపిరి ఆడ", "స్పృహ", "మూర్ఛ",
]
SELF_HARM = [
    r"suicid", r"kill myself", r"end my life", r"want to die", r"don'?t want to (live|be alive)", r"hurt myself", r"self[- ]harm",
    "आत्महत्या", "मरना चाहता", "मरना चाहती", "ఆత్మహత్య", "చనిపోవాలని",
]
_med = re.compile("|".join(MEDICAL), re.I)
_sh = re.compile("|".join(SELF_HARM), re.I)

MSG = {
    "medical": {
        "en": "This could be a medical emergency. Call 112 now or press SOS. Do not wait for an online answer.",
        "hi": "यह आपातकाल हो सकता है। अभी 112 पर कॉल करें या SOS दबाएं। ऑनलाइन जवाब का इंतज़ार न करें।",
        "te": "ఇది అత్యవసర పరిస్థితి కావచ్చు. వెంటనే 112కు కాల్ చేయండి లేదా SOS నొక్కండి.",
    },
    "self_harm": {
        "en": "I'm really glad you told me. You deserve support right now. In India you can call Tele-MANAS at 14416 (free, 24/7) or 112 if you may be in danger. If someone is nearby, please let them know how you feel. I can also alert your emergency contacts.",
        "hi": "आपने बताया, यह अच्छा किया। अभी आपको सहारा मिलना चाहिए। भारत में Tele-MANAS 14416 (मुफ़्त, 24x7) पर कॉल करें, खतरा हो तो 112। पास में कोई हो तो उन्हें बताएं।",
        "te": "మీరు చెప్పడం మంచిది. ఇప్పుడు మీకు తోడు అవసరం. భారతదేశంలో Tele-MANAS 14416 (ఉచితం, 24/7) కు కాల్ చేయండి, ప్రమాదం ఉంటే 112. దగ్గర ఎవరైనా ఉంటే వారికి చెప్పండి.",
    },
}


def detect(text: str) -> str | None:
    """Return 'self_harm', 'medical' or None. Self-harm takes priority."""
    if not text:
        return None
    if _sh.search(text):
        return "self_harm"
    if _med.search(text):
        return "medical"
    return None


def emergency_reply(kind: str, lang: str = "en") -> dict:
    m = MSG[kind]
    return {"reply": m.get(lang, m["en"]), "urgent": True,
            "actions": [{"feature": "sos", "label": "Open SOS", "prefill": None}], "safety_override": kind}


# Class-level cross-reactivity for the common allergy classes. Educational flag only, not a clinical decision tool.
CLASSES = {
    "penicillin": ["penicillin", "amoxicillin", "ampicillin", "amoxyclav", "augmentin", "cloxacillin", "piperacillin"],
    "sulfa": ["sulfa", "sulfamethoxazole", "cotrimoxazole", "septran", "bactrim"],
    "nsaid": ["ibuprofen", "diclofenac", "naproxen", "aspirin", "ketorolac", "aceclofenac", "nimesulide", "brufen", "voveran"],
    "aspirin": ["aspirin", "ecosprin", "disprin"],
    "paracetamol": ["paracetamol", "acetaminophen", "crocin", "dolo"],
    "cephalosporin": ["cef", "cephalexin", "ceftriaxone", "cefixime"],
}


def allergy_conflicts(med: str, allergies: list[str]) -> list[str]:
    med_l = med.lower()
    hits = []
    for a in allergies or []:
        al = a.lower().strip()
        if not al:
            continue
        group = next((v for k, v in CLASSES.items() if k in al or al in k), None)
        if al in med_l or (group and any(t in med_l for t in group)):
            hits.append(f"{med} may conflict with your listed allergy: {a}. Check with your doctor or pharmacist before taking it.")
    return hits
