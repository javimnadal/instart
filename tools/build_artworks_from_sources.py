from __future__ import annotations

import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile

from PIL import Image
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "assets" / "artworks"
OUT_JS = ROOT / "artworks-data.js"
USER_AGENT = "ArsMemoriaIndexer/1.0 (local study app)"

DOCX_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
BOILERPLATE = ("Tema 56:", "Academia Montes", "Inscrita en el Registro", "Copyright")
GENERIC_TERMS = {
    "arte",
    "anexo",
    "edad media",
    "edad antigua",
    "edad moderna",
    "edad contemporanea",
    "imperio romano",
    "peninsula iberica",
    "revolucion francesa",
    "revolucion industrial",
}

CURATED_REFERENCES = {
    "Arte prehistorico": [
        ("Cabeza de caballo de Mas d'Azil", "0. Anexo Arte Prehistórico.docx"),
        ("Venus de Willendorf", "0. Anexo Arte Prehistórico.docx"),
        ("Venus de Lespugue", "0. Anexo Arte Prehistórico.docx"),
        ("Venus de Laussel", "0. Anexo Arte Prehistórico.docx"),
        ("Cueva de Altamira", "0. Anexo Arte Prehistórico.docx"),
        ("Cueva de Lascaux", "0. Anexo Arte Prehistórico.docx"),
        ("Cueva de El Castillo", "0. Anexo Arte Prehistórico.docx"),
        ("Abrigo de Cogul", "0. Anexo Arte Prehistórico.docx"),
        ("Cueva de Valltorta", "0. Anexo Arte Prehistórico.docx"),
    ],
    "Arte egipcio": [
        ("Pirámides de Gizeh", "1. Anexo Arte Egipcio.docx"),
        ("Pirámide de Keops", "1. Anexo Arte Egipcio.docx"),
        ("Gran Esfinge de Guiza", "1. Anexo Arte Egipcio.docx"),
        ("Templo de Karnak", "1. Anexo Arte Egipcio.docx"),
        ("Templo de Luxor", "1. Anexo Arte Egipcio.docx"),
        ("Abu Simbel", "1. Anexo Arte Egipcio.docx"),
        ("Busto de Nefertiti", "1. Anexo Arte Egipcio.docx"),
        ("Escriba sentado", "1. Anexo Arte Egipcio.docx"),
        ("Tríada de Micerino", "1. Anexo Arte Egipcio.docx"),
        ("Paleta de Narmer", "1. Anexo Arte Egipcio.docx"),
        ("Máscara funeraria de Tutankamón", "1. Anexo Arte Egipcio.docx"),
    ],
    "Arte mesopotamico": [
        ("Zigurat de Ur", "2. Anexo Arte Mesopotámico.docx"),
        ("Estandarte de Ur", "2. Anexo Arte Mesopotámico.docx"),
        ("Estela de Naram-Sin", "2. Anexo Arte Mesopotámico.docx"),
        ("Código de Hammurabi", "2. Anexo Arte Mesopotámico.docx"),
        ("Puerta de Ishtar", "2. Anexo Arte Mesopotámico.docx"),
        ("Leona herida", "2. Anexo Arte Mesopotámico.docx"),
        ("Lammasu de Khorsabad", "2. Anexo Arte Mesopotámico.docx"),
        ("Estatua de Gudea", "2. Anexo Arte Mesopotámico.docx"),
    ],
    "Arte persa": [
        ("Persépolis", "3. Anexo Arte Persa.docx"),
        ("Puerta de Jerjes", "3. Anexo Arte Persa.docx"),
        ("Apadana de Persépolis", "3. Anexo Arte Persa.docx"),
        ("Friso de los Inmortales", "3. Anexo Arte Persa.docx"),
        ("Friso de los Arqueros de Susa", "3. Anexo Arte Persa.docx"),
        ("Tumba de Ciro el Grande", "3. Anexo Arte Persa.docx"),
        ("Naqsh-e Rostam", "3. Anexo Arte Persa.docx"),
        ("Tesoro de Oxus", "3. Anexo Arte Persa.docx"),
    ],
    "Arte ibero": [
        ("Dama de Elche", "4. I Anexo Arte Íbero.docx"),
        ("Dama de Baza", "4. I Anexo Arte Íbero.docx"),
        ("Bicha de Balazote", "4. I Anexo Arte Íbero.docx"),
        ("Monumento de Pozo Moro", "4. I Anexo Arte Íbero.docx"),
        ("Dama oferente del Cerro de los Santos", "4. I Anexo Arte Íbero.docx"),
        ("Pilar-estela de Monforte del Cid", "4. I Anexo Arte Íbero.docx"),
    ],
    "Arte paleocristiano": [
        ("Catacumbas de San Calixto", "5. Anexo Arte Paleocristiano.docx"),
        ("Sarcófago de Junio Basso", "5. Anexo Arte Paleocristiano.docx"),
        ("Basílica de Santa Sabina", "5. Anexo Arte Paleocristiano.docx"),
        ("Mausoleo de Santa Constanza", "5. Anexo Arte Paleocristiano.docx"),
        ("Mausoleo de Gala Placidia", "5. Anexo Arte Paleocristiano.docx"),
        ("Sarcófago del Buen Pastor", "5. Anexo Arte Paleocristiano.docx"),
    ],
    "Arte visigodo": [
        ("San Juan de Baños", "6. Anexo Arte Visigodo.docx"),
        ("Santa Comba de Bande", "6. Anexo Arte Visigodo.docx"),
        ("San Pedro de la Nave", "6. Anexo Arte Visigodo.docx"),
        ("Quintanilla de las Viñas", "6. Anexo Arte Visigodo.docx"),
        ("Tesoro de Guarrazar", "6. Anexo Arte Visigodo.docx"),
        ("Corona de Recesvinto", "6. Anexo Arte Visigodo.docx"),
    ],
    "Arte bizantino": [
        ("Santa Sofía de Constantinopla", "7. Anexo Arte Bizantino.docx"),
        ("San Vital de Rávena", "7. Anexo Arte Bizantino.docx"),
        ("Mosaico de Justiniano", "7. Anexo Arte Bizantino.docx"),
        ("Mosaico de Teodora", "7. Anexo Arte Bizantino.docx"),
        ("San Apolinar in Classe", "7. Anexo Arte Bizantino.docx"),
        ("Basílica de San Marcos de Venecia", "7. Anexo Arte Bizantino.docx"),
    ],
    "Arte mozarabe": [
        ("San Miguel de Escalada", "8. Anexo Arte Mozárabe.docx"),
        ("Santiago de Peñalba", "8. Anexo Arte Mozárabe.docx"),
        ("San Baudelio de Berlanga", "8. Anexo Arte Mozárabe.docx"),
        ("Beato de Liébana", "8. Anexo Arte Mozárabe.docx"),
        ("Beato de Gerona", "8. Anexo Arte Mozárabe.docx"),
        ("San Cebrián de Mazote", "8. Anexo Arte Mozárabe.docx"),
    ],
    "Arte asturiano": [
        ("San Julián de los Prados", "8.I Anexo Arte Asturiano.docx"),
        ("Santa María del Naranco", "8.I Anexo Arte Asturiano.docx"),
        ("San Miguel de Lillo", "8.I Anexo Arte Asturiano.docx"),
        ("Santa Cristina de Lena", "8.I Anexo Arte Asturiano.docx"),
        ("Cámara Santa de Oviedo", "8.I Anexo Arte Asturiano.docx"),
        ("Cruz de los Ángeles", "8.I Anexo Arte Asturiano.docx"),
        ("Cruz de la Victoria", "8.I Anexo Arte Asturiano.docx"),
    ],
    "Arte mudejar": [
        ("Iglesia de Santiago del Arrabal", "Anexo Arte Mudejar.docx"),
        ("San Tirso de Sahagún", "Anexo Arte Mudejar.docx"),
        ("San Lorenzo de Sahagún", "Anexo Arte Mudejar.docx"),
        ("Torre de San Martín de Teruel", "Anexo Arte Mudejar.docx"),
        ("Torre de San Pablo de Zaragoza", "Anexo Arte Mudejar.docx"),
        ("Salón de Embajadores del Alcázar de Sevilla", "Anexo Arte Mudejar.docx"),
    ],
    "Neoclasicismo": [
        ("La Madeleine de París", "Anexo Arte Neoclásico.docx"),
        ("Panteón de París", "Anexo Arte Neoclásico.docx"),
        ("Puerta de Alcalá", "Anexo Arte Neoclásico.docx"),
        ("Museo del Prado", "Anexo Arte Neoclásico.docx"),
        ("Eros y Psique de Canova", "Anexo Arte Neoclásico.docx"),
        ("Paulina Borghese de Canova", "Anexo Arte Neoclásico.docx"),
        ("El juramento de los Horacios", "Anexo Arte Neoclásico.docx"),
        ("La muerte de Marat", "Anexo Arte Neoclásico.docx"),
    ],
    "Rococo": [
        ("Peregrinación a la isla de Citera", "Anexo Arte Rococó.docx"),
        ("El columpio de Fragonard", "Anexo Arte Rococó.docx"),
        ("Desnudo en reposo de Boucher", "Anexo Arte Rococó.docx"),
        ("La bendición de Chardin", "Anexo Arte Rococó.docx"),
        ("Retrato de Madame de Pompadour", "Anexo Arte Rococó.docx"),
    ],
    "Romanticismo": [
        ("El 3 de mayo en Madrid", "Anexo Arte Romántico.docx"),
        ("La libertad guiando al pueblo", "Anexo Arte Romántico.docx"),
        ("La balsa de la Medusa", "Anexo Arte Romántico.docx"),
        ("El caminante sobre el mar de nubes", "Anexo Arte Romántico.docx"),
        ("El monje frente al mar", "Anexo Arte Romántico.docx"),
        ("Lluvia, vapor y velocidad", "Anexo Arte Romántico.docx"),
    ],
    "Realismo": [
        ("Entierro en Ornans", "Anexo Arte Realismo.docx"),
        ("El taller del pintor", "Anexo Arte Realismo.docx"),
        ("Las espigadoras", "Anexo Arte Realismo.docx"),
        ("El Ángelus", "Anexo Arte Realismo.docx"),
        ("El vagón de tercera clase", "Anexo Arte Realismo.docx"),
        ("La lavandera de Daumier", "Anexo Arte Realismo.docx"),
    ],
}


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value.lower()).strip("-")
    return value[:72] or "obra"


def normalize(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").lower()


def style_from_filename(path: Path) -> str:
    name = normalize(path.stem)
    mapping = [
        ("prehistor", "Arte prehistorico"),
        ("egip", "Arte egipcio"),
        ("mesopot", "Arte mesopotamico"),
        ("persa", "Arte persa"),
        ("ibero", "Arte ibero"),
        ("cretomicen", "Arte cretomicenico"),
        ("griego", "Arte griego"),
        ("roma", "Arte romano"),
        ("paleocrist", "Arte paleocristiano"),
        ("visigodo", "Arte visigodo"),
        ("bizantino", "Arte bizantino"),
        ("mozar", "Arte mozarabe"),
        ("asturiano", "Arte asturiano"),
        ("mudejar", "Arte mudejar"),
        ("neoclas", "Neoclasicismo"),
        ("realismo", "Realismo"),
        ("rococo", "Rococo"),
        ("romant", "Romanticismo"),
    ]
    for needle, style in mapping:
        if needle in name:
            return style
    return "Historia del arte"


def period_from_style(style: str) -> str:
    if style in {"Neoclasicismo", "Realismo", "Rococo", "Romanticismo"}:
        return "Edad Contemporanea"
    if style in {"Arte visigodo", "Arte bizantino", "Arte mozarabe", "Arte asturiano", "Arte mudejar", "Arte paleocristiano"}:
        return "Edad Media"
    if style in {"Arte prehistorico", "Arte ibero"}:
        return "Prehistoria y protohistoria"
    return "Edad Antigua"


def clean_paragraphs(text: str) -> list[str]:
    paragraphs: list[str] = []
    for raw in re.split(r"\n\s*\n+", text):
        lines = []
        for line in raw.splitlines():
            line = re.sub(r"\s+", " ", line).strip()
            if not line or line.isdigit() or line == "ANEXO":
                continue
            if any(line.startswith(prefix) for prefix in BOILERPLATE):
                continue
            lines.append(line)
        if lines:
            paragraphs.append(" ".join(lines))
    return paragraphs


def title_from_caption(caption: str) -> str:
    patterns = [
        r"^\([^)]*\)\.?\s*([^.\[]+?)\s*\[",
        r"\([^)]*\)\.?\s*([^.\[]+?)\s*\[",
        r"^[^.]+?\.\s*(.+?)\s*\([^)]*\)\s*\[",
        r"^(.+?)\.\s*\([^)]*\).*?\[",
        r"^(.+?)\s*\[",
    ]
    candidate = ""
    for pattern in patterns:
        match = re.search(pattern, caption)
        if match and match.group(1).strip():
            candidate = match.group(1)
            break
    if not candidate:
        candidate = caption.split("[")[0].strip()
    candidate = re.sub(r"\([^)]*\)", "", candidate)
    candidate = re.sub(r"^(?:Fig\.?|Imagen|Lamina)\s*\d*[:.-]?\s*", "", candidate, flags=re.I)
    return candidate.strip(" .")[:95] or "Lamina"


def artist_from_caption(caption: str) -> str:
    if re.match(r"^[^.]+?\.\s*\(", caption):
        return ""
    match = re.match(r"^(.+?)\.\s*[^.]+?\s*(?:\(|\[)", caption)
    if match:
        artist = match.group(1).strip()
        if len(artist) < 60:
            return artist
    return ""


def date_from_caption(caption: str) -> str:
    match = re.search(r"\(([^)]*(?:a\.C\.|d\.C\.|siglo|Siglo|\d{2,4})[^)]*)\)", caption)
    return match.group(1).strip() if match else ""


def type_from_caption(caption: str) -> str:
    match = re.search(r"\[([^\]]+)\]", caption)
    return match.group(1).strip() if match else ""


def save_image(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix.lower() in {".jpg", ".jpeg"} and image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    image.save(path, quality=90, optimize=True)


def extract_pdf_records(pdf_path: Path) -> list[dict]:
    reader = PdfReader(str(pdf_path))
    source_slug = slugify(pdf_path.stem)
    style = style_from_filename(pdf_path)
    records = []

    for page_index, page in enumerate(reader.pages, start=1):
        captions = clean_paragraphs(page.extract_text() or "")
        images = []
        for image_file in page.images:
            if not image_file.name.lower().endswith((".jpg", ".jpeg")):
                continue
            width, height = image_file.image.size
            if width * height < 12000 or (width, height) == (799, 70):
                continue
            images.append(image_file)

        for image_index, image_file in enumerate(images, start=1):
            caption = captions[min(len(captions) - 1, (image_index - 1) * max(1, len(captions)) // max(1, len(images)))] if captions else ""
            title = title_from_caption(caption) if caption else f"Lamina pagina {page_index}"
            suffix = f" · imagen {image_index}" if len(images) > max(1, len(captions)) else ""
            filename = f"{source_slug}-p{page_index:02d}-{image_index:02d}-{slugify(title)}.jpg"
            save_image(image_file.image, ASSET_DIR / filename)
            records.append(
                {
                    "id": f"{source_slug}-p{page_index:02d}-i{image_index:02d}",
                    "title": f"{title}{suffix}",
                    "artist": artist_from_caption(caption),
                    "date": date_from_caption(caption),
                    "style": style,
                    "period": period_from_style(style),
                    "type": type_from_caption(caption),
                    "image": f"assets/artworks/{filename}",
                    "notes": f"{caption} Fuente: {pdf_path.name}, pagina {page_index}, imagen {image_index}.",
                    "favorite": False,
                    "reviews": 0,
                    "ease": 2.5,
                    "interval": 0,
                    "due": 0,
                }
            )
    return records


def docx_paragraphs(path: Path) -> list[str]:
    with ZipFile(path) as zf:
        root = ET.fromstring(zf.read("word/document.xml"))
    paragraphs = []
    for paragraph in root.findall(".//w:p", DOCX_NS):
        text = "".join(node.text or "" for node in paragraph.findall(".//w:t", DOCX_NS)).strip()
        if text:
            paragraphs.append(re.sub(r"\s+", " ", text))
    return paragraphs


def add_candidate(candidates: list[str], value: str) -> None:
    value = re.sub(r"\s+", " ", value).strip(" .,:;()[]")
    value = re.sub(r"^(?:el|la|los|las|un|una|unos|unas)\s+", "", value, flags=re.I)
    key = normalize(value)
    if not 5 <= len(value) <= 85:
        return
    if key in GENERIC_TERMS or key.startswith(("arte ", "periodo ", "siglo ", "elemento ", "escuela de")):
        return
    if value not in candidates:
        candidates.append(value)


def docx_candidates(path: Path) -> list[str]:
    candidates: list[str] = []
    strong_patterns = [
        r"\b(?:Venus|Cueva|Cuevas|Pir[aá]mide|Templo|Palacio|Zigurat|Friso|Dama|Bicha|Sarc[oó]fago|Bas[ií]lica|Iglesia|Santa|San|Cruz|Puerta|Torre|Maison|Pante[oó]n|Ara|Columna|Arco|Vag[oó]n|Angelus|Desnudo|Contrato|Jura|Muerte|Libertad|Balsa|Monje|Catedral|Monasterio)\s+(?:de|del|la|las|los|en|a|[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÜÑáéíóúüñ'’\-]+)(?:\s+(?:de|del|la|las|los|y|en|a|[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÜÑáéíóúüñ'’\-]+)){0,7}",
    ]
    trigger_pattern = re.compile(
        r"(?i)(?:destaca(?:n)?|ejemplo(?:s)?|obra(?:s)? como|conservamos|encontramos|son|fue|llamad[ao]s?)\s+([^.;:]{6,120})"
    )
    for paragraph in docx_paragraphs(path):
        for quoted in re.findall(r"[\"“”](.*?)[\"“”]", paragraph):
            add_candidate(candidates, quoted)
        for pattern in strong_patterns:
            for match in re.finditer(pattern, paragraph):
                add_candidate(candidates, match.group(0))
        for match in trigger_pattern.finditer(paragraph):
            chunk = re.split(r",| y | pero | que | donde | en el que | con ", match.group(1))[0]
            add_candidate(candidates, chunk)
    return candidates[:22]


def fetch_wikipedia_image(query: str) -> str:
    params = {
        "action": "query",
        "format": "json",
        "generator": "search",
        "gsrsearch": f"{query} arte",
        "gsrlimit": "1",
        "prop": "pageimages",
        "piprop": "thumbnail",
        "pithumbsize": "1000",
    }
    url = "https://es.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=12) as response:
        payload = json.loads(response.read().decode("utf-8"))
    pages = payload.get("query", {}).get("pages", {})
    for page in pages.values():
        thumbnail = page.get("thumbnail", {}).get("source")
        if thumbnail:
            return thumbnail
    return ""


def build_docx_records(path: Path, cache: dict[str, str]) -> list[dict]:
    style = style_from_filename(path)
    source_slug = slugify(path.stem)
    records = []
    for index, title in enumerate(docx_candidates(path), start=1):
        cache_key = normalize(title)
        image = cache.get(cache_key, "")
        if cache_key not in cache:
            try:
                image = fetch_wikipedia_image(title)
            except Exception:
                image = ""
            cache[cache_key] = image
            time.sleep(0.08)
        if not image:
            continue
        records.append(
            {
                "id": f"{source_slug}-ref-{index:02d}",
                "title": title,
                "artist": "",
                "date": "",
                "style": style,
                "period": period_from_style(style),
                "type": "Referencia textual",
                "image": image,
                "notes": f"Referencia mencionada en {path.name}. Imagen enlazada automaticamente desde Wikipedia/Wikimedia.",
                "favorite": False,
                "reviews": 0,
                "ease": 2.5,
                "interval": 0,
                "due": 0,
            }
        )
    return records


def build_curated_reference_records(cache: dict[str, str]) -> list[dict]:
    records = []
    for style, entries in CURATED_REFERENCES.items():
        for index, (title, source) in enumerate(entries, start=1):
            cache_key = normalize(f"{style} {title}")
            image = cache.get(cache_key, "")
            if cache_key not in cache:
                try:
                    image = fetch_wikipedia_image(title)
                except Exception:
                    image = ""
                cache[cache_key] = image
                time.sleep(0.08)
            if not image:
                continue
            records.append(
                {
                    "id": f"{slugify(style)}-ref-{index:02d}-{slugify(title)}",
                    "title": title,
                    "artist": "",
                    "date": "",
                    "style": style,
                    "period": period_from_style(style),
                    "type": "Referencia textual",
                    "image": image,
                    "notes": f"Referencia mencionada en {source}. Imagen enlazada automaticamente desde Wikipedia/Wikimedia.",
                    "favorite": False,
                    "reviews": 0,
                    "ease": 2.5,
                    "interval": 0,
                    "due": 0,
                }
            )
    return records


def main() -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    for old_file in ASSET_DIR.glob("*"):
        if old_file.is_file():
            old_file.unlink()

    records: list[dict] = []
    for pdf_path in sorted(list(ROOT.glob("*.pdf")) + list(ROOT.glob("*.PDF"))):
        records.extend(extract_pdf_records(pdf_path))

    cache_path = ROOT / "tools" / ".image-cache.json"
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    records.extend(build_curated_reference_records(cache))
    cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")

    seen = set()
    deduped = []
    for record in records:
        key = record["id"]
        if key not in seen:
            seen.add(key)
            deduped.append(record)

    OUT_JS.write_text(
        "window.ARS_MEMORIA_ARTWORKS = "
        + json.dumps(deduped, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )
    print(f"Generated {len(deduped)} artworks")
    print(f"Local assets: {len(list(ASSET_DIR.glob('*')))}")


if __name__ == "__main__":
    main()
