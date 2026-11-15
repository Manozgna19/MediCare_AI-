"""Small, conservative drug-interaction screen. Educational only; NOT a substitute for a pharmacist.
Covers only a handful of well-known high-impact combinations."""
import re

BRAND = {
    "dolo": "paracetamol", "crocin": "paracetamol", "calpol": "paracetamol", "acetaminophen": "paracetamol",
    "ecosprin": "aspirin", "disprin": "aspirin", "brufen": "ibuprofen", "combiflam": "ibuprofen", "voveran": "diclofenac",
    "glycomet": "metformin", "glucophage": "metformin", "telma": "telmisartan", "amlong": "amlodipine", "storvas": "atorvastatin",
    "atorva": "atorvastatin", "rosuvas": "rosuvastatin", "plavix": "clopidogrel", "clopilet": "clopidogrel",
    "coumadin": "warfarin", "uniwarfin": "warfarin", "viagra": "sildenafil", "sorbitrate": "isosorbide", "isordil": "isosorbide",
    "zoloft": "sertraline", "prozac": "fluoxetine", "ultracet": "tramadol", "zocor": "simvastatin", "klacid": "clarithromycin",
    "aldactone": "spironolactone", "valium": "diazepam", "xanax": "alprazolam", "ativan": "lorazepam",
}
GROUPS = {
    "anticoagulant": {"warfarin", "acenocoumarol", "apixaban", "rivaroxaban", "dabigatran"},
    "antiplatelet": {"aspirin", "clopidogrel", "prasugrel", "ticagrelor"},
    "nsaid": {"ibuprofen", "diclofenac", "naproxen", "ketorolac", "aceclofenac", "nimesulide", "indomethacin", "aspirin"},
    "acei_arb": {"enalapril", "ramipril", "lisinopril", "telmisartan", "losartan", "valsartan", "olmesartan", "perindopril"},
    "k_sparing": {"spironolactone", "eplerenone", "amiloride"},
    "nitrate": {"isosorbide", "nitroglycerin"},
    "pde5": {"sildenafil", "tadalafil", "vardenafil"},
    "simvastatin": {"simvastatin"}, "macrolide": {"clarithromycin", "erythromycin"},
    "ssri": {"fluoxetine", "sertraline", "paroxetine", "escitalopram", "citalopram"},
    "tramadol": {"tramadol"},
    "sedative": {"diazepam", "alprazolam", "lorazepam", "clonazepam", "zolpidem"},
    "opioid": {"tramadol", "codeine", "morphine", "tapentadol"},
}
RULES = [
    ("anticoagulant", "nsaid", "high", "A blood thinner with an anti-inflammatory painkiller raises the risk of serious bleeding."),
    ("anticoagulant", "antiplatelet", "high", "Two medicines that both reduce clotting raise the risk of bleeding."),
    ("anticoagulant", "ssri", "moderate", "This antidepressant can add to the bleeding risk of a blood thinner."),
    ("antiplatelet", "nsaid", "moderate", "Together these can raise stomach-bleeding risk and may blunt aspirin's heart protection."),
    ("acei_arb", "k_sparing", "moderate", "This pair can push potassium too high. Blood tests are usually needed."),
    ("acei_arb", "nsaid", "moderate", "Painkillers like these can weaken blood-pressure medicine and strain the kidneys."),
    ("nitrate", "pde5", "high", "This combination can cause a dangerous drop in blood pressure. Do not combine without a doctor."),
    ("simvastatin", "macrolide", "moderate", "This antibiotic can raise statin levels and the risk of muscle damage."),
    ("ssri", "tramadol", "high", "Together these can cause serotonin syndrome, which needs urgent care."),
    ("ssri", "nsaid", "moderate", "Together these can raise the risk of stomach bleeding."),
    ("sedative", "opioid", "high", "Together these can slow breathing dangerously."),
]
_ALL = set().union(*GROUPS.values()) | set(BRAND.values())
_ORDER = {"high": 0, "moderate": 1}


def canonical(name: str) -> set[str]:
    out = set()
    for tok in re.findall(r"[a-z]+", (name or "").lower()):
        tok = BRAND.get(tok, tok)
        if tok in _ALL:
            out.add(tok)
    return out


def check(meds: list[str]) -> list[dict]:
    canon = [(m, canonical(m)) for m in meds]
    best: dict[frozenset, dict] = {}
    for i in range(len(canon)):
        for j in range(i + 1, len(canon)):
            (mi, ci), (mj, cj) = canon[i], canon[j]
            if not ci or not cj or ci == cj:
                continue
            for a, b, sev, msg in RULES:
                A, B = GROUPS[a], GROUPS[b]
                if (ci & A and cj & B) or (ci & B and cj & A):
                    key = frozenset((mi, mj))
                    if key not in best or _ORDER[sev] < _ORDER[best[key]["severity"]]:
                        best[key] = {"meds": [mi, mj], "severity": sev, "message": msg}
    return sorted(best.values(), key=lambda x: _ORDER[x["severity"]])


def check_new(new: str, existing: list[str]) -> list[dict]:
    return [x for x in check(existing + [new]) if new in x["meds"]]
