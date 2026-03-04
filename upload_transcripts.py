#!/usr/bin/env python3
"""
Sube transcripciones de VODs al backend.

Uso:
  python upload_transcripts.py --vod 2693745290         # Sube un VOD específico
  python upload_transcripts.py --all                    # Sube todos los VODs disponibles
  python upload_transcripts.py --all --source custom.json  # Usa un archivo JSON distinto
"""

import json
import argparse
import requests
from pathlib import Path

# ─── CONFIGURACIÓN ───────────────────────────────────────────────────────────
API_BASE_URL = "https://backend.permisossubtel.cl/api"
TRANSCRIPT_ENDPOINT = f"{API_BASE_URL}/transcripts/upload/"
ALL_TRANSCRIPTS_FILE = Path("streamladder/all_transcripts.json")
SAVE_DIR = Path("streamladder/per_vod_transcripts")
# ─────────────────────────────────────────────────────────────────────────────


def load_all_transcripts(source: Path) -> dict:
    """Carga el archivo JSON con todos los transcripts. Clave = vod_id."""
    if not source.exists():
        print(f"[ERROR] No se encontró el archivo: {source}")
        return {}
    with open(source) as f:
        return json.load(f)


def save_per_vod(vod_id: str, entries: list) -> Path:
    """Guarda el transcript de un VOD en un archivo JSON individual."""
    SAVE_DIR.mkdir(parents=True, exist_ok=True)
    path = SAVE_DIR / f"{vod_id}.json"
    with open(path, "w") as f:
        json.dump(entries, f, indent=2, ensure_ascii=False)
    return path


def upload_transcript(vod_id: str, entries: list) -> dict:
    """Envía el transcript al endpoint del backend."""
    payload = {
        "video_id": vod_id,
        "entries": entries,
    }
    try:
        resp = requests.post(TRANSCRIPT_ENDPOINT, json=payload, timeout=30)
        return {"status_code": resp.status_code, "body": resp.json()}
    except requests.exceptions.ConnectionError:
        return {"status_code": None, "body": {"error": "No se pudo conectar al servidor"}}
    except Exception as e:
        return {"status_code": None, "body": {"error": str(e)}}


def process_vod(vod_id: str, entries: list) -> bool:
    """Guarda localmente y sube al backend. Retorna True si fue exitoso."""
    print(f"\n[VOD {vod_id}] Entradas: {len(entries)}")

    # 1. Guardar localmente ANTES de intentar subir (seguridad ante fallos)
    saved_path = save_per_vod(vod_id, entries)
    print(f"  → Guardado en: {saved_path}")

    # 2. Subir al backend
    result = upload_transcript(vod_id, entries)
    code = result["status_code"]
    body = result["body"]

    if code == 200:
        print(f"  ✓ Actualizado: {body.get('message', '')}")
        return True
    elif code == 201:
        print(f"  ✓ Creado: {body.get('message', '')}")
        return True
    elif code == 404:
        print(f"  ✗ Error: VOD no encontrado en la BD → {body.get('error', '')}")
        return False
    elif code is None:
        print(f"  ✗ Error de conexión: {body.get('error', '')}")
        return False
    else:
        print(f"  ✗ Error [{code}]: {body}")
        return False


def run_single(vod_id: str, source: Path):
    all_transcripts = load_all_transcripts(source)

    if vod_id not in all_transcripts:
        print(f"[ERROR] VOD {vod_id} no encontrado en {source}")
        return

    entries = all_transcripts[vod_id]
    process_vod(vod_id, entries)


def run_all(source: Path):
    all_transcripts = load_all_transcripts(source)

    if not all_transcripts:
        print("[ERROR] No hay transcripts disponibles.")
        return

    vod_ids = list(all_transcripts.keys())
    print(f"[INFO] Se procesarán {len(vod_ids)} VODs: {vod_ids}")

    success, failed = [], []
    for vod_id in vod_ids:
        entries = all_transcripts[vod_id]
        ok = process_vod(vod_id, entries)
        (success if ok else failed).append(vod_id)

    print(f"\n{'─'*50}")
    print(f"Resultado: {len(success)} exitosos, {len(failed)} fallidos")
    if failed:
        print(f"Fallidos: {failed}")


def main():
    parser = argparse.ArgumentParser(description="Sube transcripciones de VODs al backend")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--vod", metavar="VOD_ID", help="ID del VOD a subir")
    group.add_argument("--all", action="store_true", help="Subir todos los VODs disponibles")
    parser.add_argument(
        "--source",
        metavar="FILE",
        default=str(ALL_TRANSCRIPTS_FILE),
        help=f"Archivo JSON con los transcripts (default: {ALL_TRANSCRIPTS_FILE})",
    )

    args = parser.parse_args()
    source = Path(args.source)

    if args.vod:
        run_single(args.vod, source)
    else:
        run_all(source)


if __name__ == "__main__":
    main()
