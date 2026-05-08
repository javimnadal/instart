from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

from PIL import Image
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "Tema-56--El-arte-clasico-Grecia-y-Roma---anexo.pdf"
ASSET_DIR = ROOT / "assets" / "artworks"
OUT_JS = ROOT / "artworks-data.js"
DATA_PREFIX = "tema-56-annex-"


BOILERPLATE = (
    "Tema 56:",
    "Academia Montes",
    "Inscrita en el Registro",
    "Copyright",
)


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value.lower()).strip("-")
    return value[:60] or "obra"


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


def caption_for_index(captions: list[str], index: int, image_count: int) -> str:
    if not captions:
        return "Lamina sin pie de imagen"
    caption_index = min(len(captions) - 1, (index * len(captions)) // max(1, image_count))
    return captions[caption_index]


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
    return candidate.strip(" .") or "Lamina"


def artist_from_caption(caption: str) -> str:
    if re.match(r"^[^.]+?\.\s*\(", caption):
        return ""
    match = re.match(r"^(.+?)\.\s*[^.]+?\s*(?:\(|\[)", caption)
    if match:
        artist = match.group(1).strip()
        if len(artist) < 60:
            return artist
    if caption.startswith("Anónimo") or caption.startswith("Anonimo"):
        return "Anónimo"
    if caption.startswith("Desconocido"):
        return "Desconocido"
    return ""


def date_from_caption(caption: str) -> str:
    match = re.search(r"\(([^)]*(?:a\.C\.|d\.C\.|siglo|Siglo|\d{2,4})[^)]*)\)", caption)
    return match.group(1).strip() if match else ""


def style_from_page(page_number: int) -> str:
    if page_number <= 8:
        return "Arte prehelénico"
    if page_number <= 32:
        return "Arte griego"
    if page_number <= 34:
        return "Arte etrusco"
    if page_number <= 58:
        return "Arte romano"
    return "Arte paleocristiano"


def type_from_caption(caption: str) -> str:
    match = re.search(r"\[([^\]]+)\]", caption)
    return match.group(1).strip() if match else ""


def style_from_caption(caption: str, page_number: int) -> str:
    text = normalized(caption)
    if any(term in text for term in ("ciclad", "cnosos", "minoic", "creta")):
        return "Arte minoico"
    if any(term in text for term in ("micenic", "micenas", "agamenon", "megaron")):
        return "Arte micénico"
    if any(term in text for term in ("etrusc", "veyes", "cerveteri", "arezzo", "portonaccio")):
        return "Arte etrusco"
    if "paleocrist" in text or "junio basso" in text:
        return "Arte paleocristiano"
    if page_number <= 32:
        return "Arte griego"
    if page_number <= 34:
        return "Arte etrusco"
    if page_number <= 59:
        return "Arte romano"
    return "Arte paleocristiano"


def period_from_style(style: str) -> str:
    return "Edad Media" if style == "Arte paleocristiano" else "Edad Antigua"


def normalized(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return value.lower()


def read_existing_records() -> list[dict]:
    if not OUT_JS.exists():
        return []

    text = OUT_JS.read_text(encoding="utf-8")
    match = re.search(r"window\.ARS_MEMORIA_ARTWORKS\s*=\s*(\[.*\]);?\s*$", text, re.S)
    if not match:
        return []

    try:
        records = json.loads(match.group(1))
    except json.JSONDecodeError:
        return []

    return [record for record in records if not str(record.get("id", "")).startswith(DATA_PREFIX)]


def save_image(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    image.save(path, quality=90, optimize=True)


def main() -> None:
    reader = PdfReader(str(PDF))
    records = read_existing_records()
    annex_records = []
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    for old_file in list(ASSET_DIR.glob(f"{DATA_PREFIX}*.jpg")) + list(ASSET_DIR.glob("t56-*.jpg")):
        old_file.unlink()

    for page_index, page in enumerate(reader.pages, start=1):
        captions = clean_paragraphs(page.extract_text() or "")
        jpgs = [img for img in page.images if img.name.lower().endswith((".jpg", ".jpeg"))]

        for image_index, image_file in enumerate(jpgs, start=1):
            caption = caption_for_index(captions, image_index - 1, len(jpgs))
            title = title_from_caption(caption)
            style = style_from_caption(caption, page_index)
            safe = slugify(f"{DATA_PREFIX}p{page_index:02d}-{image_index:02d}-{title}")
            filename = f"{safe}.jpg"
            save_image(image_file.image, ASSET_DIR / filename)

            image_total = len(jpgs)
            title_suffix = f" · imagen {image_index}" if image_total > len(captions) else ""
            annex_records.append(
                {
                    "id": f"{DATA_PREFIX}p{page_index:02d}-i{image_index:02d}",
                    "title": f"{title}{title_suffix}",
                    "artist": artist_from_caption(caption),
                    "date": date_from_caption(caption),
                    "style": style,
                    "period": period_from_style(style),
                    "type": type_from_caption(caption),
                    "image": f"assets/artworks/{filename}",
                    "notes": f"{caption} Fuente: Tema 56, anexo, pagina {page_index}, imagen {image_index}.",
                    "favorite": False,
                    "reviews": 0,
                    "ease": 2.5,
                    "interval": 0,
                    "due": 0,
                }
            )

    records.extend(annex_records)
    payload = json.dumps(records, ensure_ascii=False, indent=2)
    OUT_JS.write_text(f"window.ARS_MEMORIA_ARTWORKS = {payload};\n", encoding="utf-8")
    print(f"Generated {len(annex_records)} Tema 56 artworks; {len(records)} total records in {OUT_JS.name}")


if __name__ == "__main__":
    main()
