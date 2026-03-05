#!/usr/bin/env python3
"""
Re-aplica corrección de usernames en transcripts ya subidos al servidor.

Uso:
  python fix_transcript_names.py --streamer_login shigity
  python fix_transcript_names.py --video_id 123456789
  python fix_transcript_names.py --all
"""
import argparse
import requests
import sys

API_BASE_URL = "https://backend.permisossubtel.cl/api"


def get_video_ids(api, streamer_login=None):
    """Fetch video IDs that have transcripts, optionally filtered by streamer."""
    url = f"{api}/videos/"
    params = {"has_transcript": "true", "page_size": 500}
    if streamer_login:
        params["streamer_login"] = streamer_login
    ids = []
    while url:
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", data) if isinstance(data, dict) else data
        ids.extend(v["id"] for v in results)
        url = data.get("next") if isinstance(data, dict) else None
        params = {}  # next URL already has params
    return ids


def fix_one(fix_url, video_id):
    resp = requests.post(fix_url, json={"video_id": video_id}, timeout=60)
    resp.raise_for_status()
    return resp.json().get("total_corrected", 0)


def main():
    parser = argparse.ArgumentParser(description="Re-aplica corrección de usernames en transcripts")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--video_id", type=str, help="ID de un VOD específico")
    group.add_argument("--streamer_login", type=str, help="Login del streamer (procesa todos sus VODs)")
    group.add_argument("--all", action="store_true", dest="all_videos", help="Procesa todos los VODs con transcript")
    parser.add_argument("--api", type=str, default=API_BASE_URL, help=f"URL base de la API (default: {API_BASE_URL})")
    args = parser.parse_args()

    api = args.api.rstrip("/")
    fix_url = f"{api}/transcripts/fix_names/"

    if args.video_id:
        video_ids = [args.video_id]
    else:
        streamer = args.streamer_login if args.streamer_login else None
        label = f"streamer '{streamer}'" if streamer else "todos los VODs"
        print(f"Obteniendo lista de VODs con transcript ({label})...")
        try:
            video_ids = get_video_ids(api, streamer)
        except requests.exceptions.RequestException as e:
            print(f"Error obteniendo videos: {e}", file=sys.stderr)
            sys.exit(1)
        if not video_ids:
            print("No se encontraron VODs con transcript.")
            return

    print(f"Procesando {len(video_ids)} VOD(s)...")
    total_corrected = 0
    for i, vid in enumerate(video_ids, 1):
        try:
            n = fix_one(fix_url, vid)
            total_corrected += n
            status = f"{n} corregidas" if n else "sin cambios"
            print(f"  [{i}/{len(video_ids)}] {vid}: {status}")
        except requests.exceptions.RequestException as e:
            print(f"  [{i}/{len(video_ids)}] {vid}: ERROR — {e}", file=sys.stderr)

    print(f"\nTotal: {total_corrected} entradas corregidas en {len(video_ids)} VOD(s).")


if __name__ == "__main__":
    main()
