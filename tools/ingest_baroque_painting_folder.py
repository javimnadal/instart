#!/usr/bin/env python3
"""Ingest the local Baroque painting folder into INSTART.

The source folder is organized as:
Pintura / country / optional school / artist / optional theme folders / image

INSTART keeps the learning category up to the artist. Theme folders are stored
as metadata only, so the feed can stay broad while search and index remain useful.
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

from PIL import Image, ImageOps


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = Path("/Users/elenacosta/Downloads/Pintura")
OUTPUT_DIR = PROJECT_ROOT / "assets" / "artworks"
DATA_FILE = PROJECT_ROOT / "artworks-data.js"
IMAGE_PREFIX = "barroco-pintura"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
IGNORED_NAMES = {".ds_store", "thumbs.db", "desktop.ini"}

CATEGORY_NAMES = {
    "animales",
    "bodegones",
    "costumbre e historia",
    "costumbres e historia",
    "mitologia y alegoria",
    "mitologia y alegorias",
    "mitologia y alegorías",
    "mitología y alegoria",
    "mitología y alegorias",
    "mitología y alegorías",
    "paisajes",
    "paisajes y retratos",
    "paisajes y vistas",
    "religion",
    "religión",
    "retratos",
    "retratos y costumbres e historia",
    "varios",
}

STYLE_BY_COUNTRY = {
    "Flandes (Belgica)": "Pintura barroca flamenca",
    "Francia": "Pintura barroca francesa",
    "Holanda": "Pintura barroca holandesa",
    "Italia": "Pintura barroca italiana",
}


def normalize_key(value: str) -> str:
    value = unicodedata.normalize("NFD", value)
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", value.strip().lower())


def slugify(value: str, fallback: str = "obra") -> str:
    value = unicodedata.normalize("NFD", value)
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = value.strip("-")
    return value or fallback


def title_from_file(path: Path) -> str:
    title = path.stem
    title = title.replace("4DPict.jpg", "")
    title = title.replace("4DPict", "")
    title = re.sub(r"[_\-]+", " ", title)
    title = re.sub(r"\s+", " ", title).strip(" ._-")
    title = re.sub(r"(?<=\D)(\d{1,2})$", "", title).strip()
    return title or "Obra sin título"


def choose_artist(parts: list[str]) -> tuple[str, list[str], list[str]]:
    country = parts[0]
    body = parts[1:]
    artist_index = None

    for index in range(len(body) - 1, -1, -1):
        if normalize_key(body[index]) not in CATEGORY_NAMES:
            artist_index = index
            break

    if artist_index is None:
        return "Autor no identificado", [], body

    artist = body[artist_index]
    school = body[:artist_index]
    categories = body[artist_index + 1 :]

    if not school and country == artist:
        school = []

    return artist, school, categories


def read_existing_records() -> list[dict]:
    if not DATA_FILE.exists():
        return []

    raw = DATA_FILE.read_text(encoding="utf-8")
    match = re.search(r"window\.ARS_MEMORIA_ARTWORKS\s*=\s*(\[.*\]);?\s*$", raw, re.S)
    if not match:
        return []
    try:
        records = json.loads(match.group(1))
    except json.JSONDecodeError:
        return []
    return [record for record in records if not str(record.get("id", "")).startswith(f"{IMAGE_PREFIX}-")]


def clean_previous_outputs() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for image_path in OUTPUT_DIR.glob(f"{IMAGE_PREFIX}-*.jpg"):
        image_path.unlink()


def convert_image(source: Path, destination: Path) -> tuple[int, int]:
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image)
        if image.mode not in {"RGB", "L"}:
            image = image.convert("RGB")
        elif image.mode == "L":
            image = image.convert("RGB")
        image.thumbnail((1800, 1800), Image.Resampling.LANCZOS)
        image.save(destination, "JPEG", quality=86, optimize=True, progressive=True)
        return image.size


def build_records() -> tuple[list[dict], Counter]:
    records = []
    counters: Counter[str] = Counter()
    stats: Counter[str] = Counter()
    image_paths = sorted(
        path
        for path in SOURCE_ROOT.rglob("*")
        if path.is_file()
        and path.suffix.lower() in IMAGE_EXTENSIONS
        and path.name.lower() not in IGNORED_NAMES
    )

    for source in image_paths:
        relative_parts = list(source.relative_to(SOURCE_ROOT).parts)
        if len(relative_parts) < 3:
            stats["skipped_too_shallow"] += 1
            continue

        country = relative_parts[0]
        folder_parts = relative_parts[:-1]
        artist, school_parts, category_parts = choose_artist(folder_parts)
        title = title_from_file(source)
        category = " / ".join(category_parts)
        school = " / ".join(school_parts)
        style = STYLE_BY_COUNTRY.get(country, "Pintura barroca")

        base_slug = slugify(f"{IMAGE_PREFIX}-{country}-{artist}-{title}")
        counters[base_slug] += 1
        slug = base_slug if counters[base_slug] == 1 else f"{base_slug}-{counters[base_slug]}"
        output_name = f"{slug}.jpg"
        output_path = OUTPUT_DIR / output_name

        try:
            width, height = convert_image(source, output_path)
        except Exception as exc:  # noqa: BLE001 - keep ingest going and report file count.
            print(f"SKIP {source}: {exc}")
            stats["skipped_unreadable"] += 1
            continue

        notes = [
            "Pintura barroca.",
            f"País/ámbito: {country}.",
            f"Autor: {artist}.",
        ]
        if school:
            notes.append(f"Corriente o escuela: {school}.")
        if category:
            notes.append(f"Tema de la carpeta original: {category}.")
        notes.append("Imagen incorporada desde la carpeta local de pintura barroca para estudio visual tipo INSTART.")

        record = {
            "id": slug,
            "title": title,
            "artist": artist,
            "date": "siglo XVII",
            "style": style,
            "period": "Barroco",
            "type": "Pintura",
            "country": country,
            "school": school,
            "category": category,
            "image": f"assets/artworks/{output_name}",
            "notes": " ".join(notes),
            "analysis": (
                f"Obra de pintura barroca atribuida en la clasificación de estudio a {artist}. "
                f"Para comentario de oposición conviene partir de la identificación, situarla en el Barroco del siglo XVII, "
                f"relacionarla con su ámbito ({country}) y estudiar composición, luz, color, movimiento, naturalismo, función y contexto."
            ),
            "folderPath": "/".join(folder_parts),
            "sourceFile": str(source),
            "width": width,
            "height": height,
            "favorite": False,
            "reviews": 0,
            "ease": 2.5,
            "interval": 0,
            "due": 0,
        }
        records.append(record)
        stats["ingested"] += 1
        stats[country] += 1

    return records, stats


def write_data(records: list[dict]) -> None:
    DATA_FILE.write_text(
        "window.ARS_MEMORIA_ARTWORKS = "
        + json.dumps(records, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )


def main() -> None:
    if not SOURCE_ROOT.exists():
        raise SystemExit(f"No existe la carpeta fuente: {SOURCE_ROOT}")

    clean_previous_outputs()
    existing_records = read_existing_records()
    new_records, stats = build_records()
    write_data(existing_records + new_records)

    print(f"Ingestadas: {stats['ingested']}")
    print(f"Saltadas no legibles: {stats['skipped_unreadable']}")
    print(f"Saltadas por ruta corta: {stats['skipped_too_shallow']}")
    for key, value in stats.items():
        if key not in {"ingested", "skipped_unreadable", "skipped_too_shallow"}:
            print(f"{key}: {value}")


if __name__ == "__main__":
    main()
