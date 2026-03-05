#!/usr/bin/env python3
"""
Re-aplica corrección de usernames en transcripts ya subidos al servidor.

Uso:
  python fix_transcript_names.py --streamer_login shigity
  python fix_transcript_names.py --video_id 123456789
  python fix_transcript_names.py --all
  python fix_transcript_names.py --streamer_login shigity --api https://otro-servidor.cl/api
"""
import argparse
import requests
import sys

API_BASE_URL = "https://backend.permisossubtel.cl/api"
FIX_URL = f"{API_BASE_URL}/transcripts/fix_names/"


def main():
    parser = argparse.ArgumentParser(description="Re-aplica corrección de usernames en transcripts")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--video_id", type=str, help="ID de un VOD específico")
    group.add_argument("--streamer_login", type=str, help="Login del streamer (procesa todos sus VODs)")
    group.add_argument("--all", action="store_true", dest="all_videos", help="Procesa todos los VODs con transcript")
    parser.add_argument("--api", type=str, default=API_BASE_URL, help=f"URL base de la API (default: {API_BASE_URL})")
    args = parser.parse_args()

    fix_url = f"{args.api.rstrip('/')}/transcripts/fix_names/"

    if args.video_id:
        payload = {"video_id": args.video_id}
        label = f"video {args.video_id}"
    elif args.streamer_login:
        payload = {"streamer_login": args.streamer_login}
        label = f"streamer '{args.streamer_login}'"
    else:
        payload = {"all": True}
        label = "todos los VODs"

    print(f"Corrigiendo usernames en transcripts de {label}...")
    try:
        resp = requests.post(fix_url, json=payload, timeout=300)
    except requests.exceptions.RequestException as e:
        print(f"Error de conexión: {e}", file=sys.stderr)
        sys.exit(1)

    if not resp.ok:
        print(f"Error {resp.status_code}: {resp.text}", file=sys.stderr)
        sys.exit(1)

    data = resp.json()
    print(f"\nResultado:")
    print(f"  VODs procesados : {data.get('videos_processed', 0)}")
    print(f"  Entradas corregidas: {data.get('total_corrected', 0)}")

    details = data.get("details", {})
    if details:
        print("\nDetalle por VOD:")
        for vid, count in sorted(details.items(), key=lambda x: -x[1]):
            if count > 0:
                print(f"  {vid}: {count} entradas corregidas")
        zeros = [vid for vid, count in details.items() if count == 0]
        if zeros:
            print(f"  ({len(zeros)} VODs sin cambios)")


if __name__ == "__main__":
    main()
