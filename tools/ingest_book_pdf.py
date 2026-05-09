from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

from PIL import Image
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PDF = Path("/private/tmp/historia-del-arte-bachillerato.pdf")
ASSET_DIR = ROOT / "assets" / "artworks"
OUT_JS = ROOT / "artworks-data.js"
DATA_PREFIX = "book-ha-"

MIN_AREA = 55_000
MIN_SIDE = 150
MAX_RECORDS = 700


UNIT_RANGES = [
    (8, 28, "Arte prehistorico / Egipto / Próximo Oriente", "Prehistoria y Edad Antigua"),
    (29, 52, "Arte clásico", "Edad Antigua"),
    (53, 70, "Arte paleocristiano / bizantino / prerrománico", "Edad Media"),
    (71, 90, "Arte islámico", "Edad Media"),
    (91, 110, "Arte románico", "Edad Media"),
    (111, 136, "Gótico / Císter / Mudéjar", "Edad Media"),
    (137, 160, "Renacimiento italiano", "Edad Moderna"),
    (161, 184, "Renacimiento europeo y español", "Edad Moderna"),
    (185, 208, "Barroco arquitectura y escultura", "Edad Moderna"),
    (209, 232, "Barroco pintura", "Edad Moderna"),
    (233, 256, "Rococó / Neoclasicismo / Goya", "Edad Moderna"),
    (257, 282, "Arquitectura contemporánea", "Edad Contemporánea"),
    (283, 308, "Pintura siglo XIX", "Edad Contemporánea"),
    (309, 332, "Vanguardias históricas", "Edad Contemporánea"),
    (333, 358, "Escultura contemporánea", "Edad Contemporánea"),
]


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value.lower()).strip("-")
    return value[:72] or "obra"


def clean_text(value: str) -> str:
    value = re.sub(r"-\s+", "", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def document_page(pdf_page: int) -> int:
    # The printed page number is roughly four pages behind the PDF index in this file.
    return max(1, pdf_page - 1)


def style_for_page(pdf_page: int) -> tuple[str, str]:
    page = document_page(pdf_page)
    for start, end, style, period in UNIT_RANGES:
        if start <= page <= end:
            return style, period
    return "Historia del arte", "Historia del arte"


def captions_from_text(text: str) -> list[str]:
    text = clean_text(text)
    matches = list(re.finditer(r"Fig\.\s*\d+\.\d+\.", text))
    captions: list[str] = []
    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        chunk = clean_text(text[start:end])
        chunk = re.split(r"\bACTIVIDADES\b|\bTécnicas de selectividad\b|\bCuestiones\b", chunk)[0]
        if len(chunk) > 480:
            chunk = chunk[:480].rsplit(" ", 1)[0] + "."
        if chunk:
            captions.append(chunk)
    return captions


def title_from_caption(caption: str, pdf_page: int, image_index: int) -> str:
    cleaned = re.sub(r"^Fig\.\s*\d+\.\d+\.\s*", "", caption)
    first_sentence = re.split(r"\.\s+", cleaned, maxsplit=1)[0]
    first_sentence = re.sub(r"\([^)]*\)", "", first_sentence).strip(" .")
    if 4 <= len(first_sentence) <= 80:
        return first_sentence
    return f"Lámina del libro · página {document_page(pdf_page)}.{image_index}"


def type_from_style(style: str, caption: str) -> str:
    text = unicodedata.normalize("NFKD", f"{style} {caption}").encode("ascii", "ignore").decode("ascii").lower()
    if any(word in text for word in ("arquitectura", "templo", "iglesia", "catedral", "palacio", "mezquita", "basilica", "arco ", "puerta", "piramide")):
        return "Arquitectura"
    if any(word in text for word in ("escultura", "estatua", "relieve", "busto", "sarcófago", "sarcofago")):
        return "Escultura"
    if any(word in text for word in ("pintura", "cuadro", "fresco", "lienzo", "tabla", "mural")):
        return "Pintura"
    return "Imagen de estudio"


def read_existing_records() -> list[dict]:
    text = OUT_JS.read_text(encoding="utf-8")
    match = re.search(r"window\.ARS_MEMORIA_ARTWORKS\s*=\s*(\[.*\]);?\s*$", text, re.S)
    if not match:
        raise RuntimeError("No se pudo leer artworks-data.js")
    records = json.loads(match.group(1))
    return [record for record in records if not str(record.get("id", "")).startswith(DATA_PREFIX)]


def save_image(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    image.save(path, quality=86, optimize=True)


def main() -> None:
    if not PDF.exists():
        raise FileNotFoundError(PDF)

    reader = PdfReader(str(PDF))
    records = read_existing_records()
    ASSET_DIR.mkdir(parents=True, exist_ok=True)

    for old_file in ASSET_DIR.glob(f"{DATA_PREFIX}*.jpg"):
        old_file.unlink()

    new_records: list[dict] = []
    for pdf_page, page in enumerate(reader.pages, start=1):
        if len(new_records) >= MAX_RECORDS:
            break
        if document_page(pdf_page) < 8:
            continue

        captions = captions_from_text(page.extract_text() or "")
        if not captions:
            continue

        usable_images = []
        for image_file in page.images:
            image = image_file.image
            width, height = image.size
            if width * height < MIN_AREA or min(width, height) < MIN_SIDE:
                continue
            usable_images.append(image_file)

        for image_index, image_file in enumerate(usable_images, start=1):
            if len(new_records) >= MAX_RECORDS:
                break

            caption = captions[min(image_index - 1, len(captions) - 1)] if captions else ""
            title = title_from_caption(caption, pdf_page, image_index)
            style, period = style_for_page(pdf_page)
            safe = slugify(f"{DATA_PREFIX}p{pdf_page:03d}-{image_index:02d}-{title}")
            filename = f"{safe}.jpg"
            save_image(image_file.image, ASSET_DIR / filename)

            notes = caption or f"Imagen extraída del libro Historia del Arte Bachillerato, página {document_page(pdf_page)}."
            new_records.append(
                {
                    "id": f"{DATA_PREFIX}p{pdf_page:03d}-i{image_index:02d}",
                    "title": title,
                    "artist": "",
                    "date": "",
                    "style": style,
                    "period": period,
                    "type": type_from_style(style, caption),
                    "image": f"assets/artworks/{filename}",
                    "sourceUrl": "https://clasesdefilosofiayarte.wordpress.com/wp-content/uploads/2017/02/historia-del-arte-bachilleraro21.pdf",
                    "notes": f"{notes} Fuente: Historia del Arte Bachillerato, página {document_page(pdf_page)}, imagen {image_index}.",
                    "favorite": False,
                    "reviews": 0,
                    "ease": 2.5,
                    "interval": 0,
                    "due": 0,
                }
            )

    payload = json.dumps(records + new_records, ensure_ascii=False, indent=2)
    OUT_JS.write_text(f"window.ARS_MEMORIA_ARTWORKS = {payload};\n", encoding="utf-8")
    print(f"Ingested {len(new_records)} book images; {len(records) + len(new_records)} total records.")


if __name__ == "__main__":
    main()
