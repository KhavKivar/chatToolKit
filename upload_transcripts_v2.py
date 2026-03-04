#!/usr/bin/env python3
"""
Descarga audio de VODs de Twitch, transcribe con faster-whisper y sube al backend.
Usa CTranslate2 con int8 en CPU (~2-4x más rápido que openai-whisper) y
muestra progreso REAL basado en los segmentos transcritos.

Requiere: pip install faster-whisper tqdm requests

Uso:
  python3 upload_transcripts_v2.py --vod 2693745290     # Procesa un VOD específico
  python3 upload_transcripts_v2.py --all                # Procesa todos los VODs en la BD
  python3 upload_transcripts_v2.py --all --model large  # Usar modelo Whisper distinto
"""

import json
import argparse
import subprocess
import tempfile
import shutil
import sys
import time
import requests
from pathlib import Path
from tqdm import tqdm

# ─── CONFIGURACIÓN ───────────────────────────────────────────────────────────
API_BASE_URL  = "https://backend.permisossubtel.cl/api"
UPLOAD_URL    = f"{API_BASE_URL}/transcripts/upload/"
VIDEOS_URL    = f"{API_BASE_URL}/videos/"
CACHE_DIR     = Path("transcripts_cache")
# ─────────────────────────────────────────────────────────────────────────────

# Velocidad estimada de faster-whisper (segundos de audio por segundo real)
# faster-whisper int8 es ~2-4x más rápido que openai-whisper en CPU
WHISPER_SPEED_CPU = {
    "tiny":           80.0,
    "tiny.en":        80.0,
    "base":           40.0,
    "base.en":        40.0,
    "small":          15.0,
    "small.en":       15.0,
    "medium":          5.0,
    "medium.en":       5.0,
    "large-v1":        2.5,
    "large-v2":        2.5,
    "large-v3":        2.5,
    "large":           2.5,
    "large-v3-turbo": 20.0,
    "turbo":          20.0,
}
# Con GPU (float16)
WHISPER_SPEED_GPU = {
    "tiny":           200.0,
    "tiny.en":        200.0,
    "base":           150.0,
    "base.en":        150.0,
    "small":           80.0,
    "small.en":        80.0,
    "medium":          35.0,
    "medium.en":       35.0,
    "large-v1":        15.0,
    "large-v2":        15.0,
    "large-v3":        15.0,
    "large":           15.0,
    "large-v3-turbo":  70.0,
    "turbo":           70.0,
}

DOWNLOAD_SPEED_X = 100.0  # audio_only ~100x real-time con HLS paralelo


def fmt_seconds(s: float) -> str:
    """Convierte segundos a string legible: '1h 23m 45s'."""
    s = int(s)
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    parts = []
    if h:
        parts.append(f"{h}h")
    if m:
        parts.append(f"{m}m")
    parts.append(f"{sec}s")
    return " ".join(parts)


def fmt_elapsed(elapsed: float) -> str:
    return fmt_seconds(elapsed)


# ── Utilidades de API ──────────────────────────────────────────────────────────

def get_video_info(vod_id: str) -> dict | None:
    try:
        resp = requests.get(f"{VIDEOS_URL}{vod_id}/", timeout=15)
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    return None


def get_all_vods() -> list[dict]:
    vods, url = [], VIDEOS_URL
    while url:
        try:
            resp = requests.get(url, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"[ERROR] No se pudo obtener VODs: {e}")
            return vods
        if isinstance(data, list):
            vods.extend(data)
            break
        vods.extend(data.get("results", []))
        url = data.get("next")
    return vods


# ── Pasos del proceso ─────────────────────────────────────────────────────────

def download_audio(vod_id: str, dest: Path, duration_s: int | None) -> bool:
    """Descarga solo el audio del VOD usando yt-dlp."""
    twitch_url = f"https://www.twitch.tv/videos/{vod_id}"

    if duration_s:
        est = duration_s / DOWNLOAD_SPEED_X
        print(f"  → Descargando audio  (duración VOD: {fmt_seconds(duration_s)}  |  estimado: ~{fmt_seconds(est)})")
    else:
        print(f"  → Descargando audio ({twitch_url})...")

    cmd = [
        "yt-dlp",
        "--no-playlist",
        "--format", "audio_only/bestaudio",
        "--concurrent-fragments", "16",
        "--progress",
        "--newline",
        "-o", f"{dest}.%(ext)s",
        twitch_url,
    ]

    t0 = time.time()
    result = subprocess.run(cmd)
    elapsed = time.time() - t0

    if result.returncode != 0:
        print(f"  ✗ yt-dlp falló ({fmt_elapsed(elapsed)})")
        return False

    print(f"  ✓ Descarga completada en {fmt_elapsed(elapsed)}")
    return True


def find_audio_file(base: Path) -> Path | None:
    for ext in ("mp4", "ts", "aac", "mp3", "m4a", "opus", "webm", "ogg", "wav"):
        p = base.parent / f"{base.name}.{ext}"
        if p.exists():
            return p
    return None


def transcribe(audio_path: Path, model, model_name: str, duration_s: int | None, use_gpu: bool = False) -> list[dict]:
    """
    Transcribe con faster-whisper mostrando progreso REAL basado en los segmentos.
    La barra avanza según seg.end (tiempo de audio transcrito) sobre el total.
    """
    speed_table = WHISPER_SPEED_GPU if use_gpu else WHISPER_SPEED_CPU
    speed_x = speed_table.get(model_name, 20.0 if use_gpu else 5.0)
    est_seconds = int(duration_s / speed_x) if duration_s else None

    if est_seconds:
        print(f"  → Transcribiendo con faster-whisper '{model_name}'  (estimado: ~{fmt_seconds(est_seconds)})")
    else:
        print(f"  → Transcribiendo con faster-whisper '{model_name}'...")

    t0 = time.time()

    # faster-whisper: transcribe() devuelve (generator_de_segmentos, info)
    # info.duration = duración total del audio en segundos
    segments_gen, info = model.transcribe(
        str(audio_path),
        language="en",
        beam_size=5,
    )

    total_audio = info.duration if info.duration else (duration_s or 0)

    bar = tqdm(
        total=int(total_audio) if total_audio else None,
        unit="s",
        unit_scale=True,
        desc="    Whisper",
        bar_format="{l_bar}{bar}| {n:.0f}/{total:.0f}s [{elapsed}<{remaining}]" if total_audio else "{l_bar}{bar}| {elapsed}",
        dynamic_ncols=True,
    )

    entries = []
    last_end = 0.0
    for seg in segments_gen:
        entries.append({
            "Text":    seg.text.strip(),
            "StartMs": int(seg.start * 1000),
            "EndMs":   int(seg.end   * 1000),
        })
        advance = seg.end - last_end
        if advance > 0:
            bar.update(int(advance))
            last_end = seg.end

    bar.close()
    elapsed = time.time() - t0
    print(f"  ✓ Transcripción completada en {fmt_elapsed(elapsed)}  ({len(entries)} segmentos)")
    return entries


def save_cache(vod_id: str, entries: list) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"{vod_id}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2, ensure_ascii=False)
    return path


def upload(vod_id: str, entries: list) -> dict:
    try:
        resp = requests.post(
            UPLOAD_URL,
            json={"video_id": vod_id, "entries": entries},
            timeout=30,
        )
        return {"code": resp.status_code, "body": resp.json()}
    except requests.exceptions.ConnectionError:
        return {"code": None, "body": {"error": "No se pudo conectar al servidor"}}
    except Exception as e:
        return {"code": None, "body": {"error": str(e)}}


# ── Procesamiento por VOD ─────────────────────────────────────────────────────

def process_vod(vod_id: str, model, model_name: str, duration_s: int | None = None, use_gpu: bool = False) -> bool:
    print(f"\n{'─'*55}")
    title_str = f"[VOD {vod_id}]"
    if duration_s:
        title_str += f"  duración: {fmt_seconds(duration_s)}"
    print(title_str)

    vod_start = time.time()
    cached = CACHE_DIR / f"{vod_id}.json"

    if cached.exists():
        print(f"  → Transcript cacheado encontrado, saltando descarga.")
        with open(cached, encoding="utf-8") as f:
            entries = json.load(f)
    else:
        tmp_dir = Path(tempfile.mkdtemp(prefix=f"vod_{vod_id}_"))
        audio_base = tmp_dir / vod_id
        try:
            if not download_audio(vod_id, audio_base, duration_s):
                return False

            audio_file = find_audio_file(audio_base)
            if not audio_file:
                print("  ✗ No se encontró el archivo de audio descargado")
                return False

            entries = transcribe(audio_file, model, model_name, duration_s, use_gpu)
            if not entries:
                print("  ✗ Whisper no generó segmentos")
                return False

            path = save_cache(vod_id, entries)
            print(f"  → Guardado en cache: {path}")

        except Exception as e:
            print(f"  ✗ Error inesperado: {e}")
            return False
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    print(f"  → Subiendo {len(entries)} segmentos al backend...")
    res = upload(vod_id, entries)
    code, body = res["code"], res["body"]

    total = fmt_elapsed(time.time() - vod_start)

    if code == 200:
        print(f"  ✓ Actualizado — {body.get('entries_saved', len(entries))} entradas  |  total: {total}")
        return True
    elif code == 201:
        print(f"  ✓ Creado     — {body.get('entries_saved', len(entries))} entradas  |  total: {total}")
        return True
    elif code == 404:
        print(f"  ✗ VOD no existe en la BD: {body.get('error', '')}")
        return False
    else:
        print(f"  ✗ Error [{code}]: {body}")
        return False


# ── Modos de ejecución ────────────────────────────────────────────────────────

def run_single(vod_id: str, model, model_name: str, use_gpu: bool):
    info = get_video_info(vod_id)
    duration_s = info.get("length_seconds") if info else None
    ok = process_vod(vod_id, model, model_name, duration_s, use_gpu)
    sys.exit(0 if ok else 1)


def run_all(model, model_name: str, use_gpu: bool):
    print("[INFO] Obteniendo lista de VODs desde la API...")
    vods = get_all_vods()
    if not vods:
        print("[ERROR] No hay VODs disponibles.")
        return

    speed_table = WHISPER_SPEED_GPU if use_gpu else WHISPER_SPEED_CPU
    speed_x = speed_table.get(model_name, 20.0 if use_gpu else 5.0)
    total_duration = sum(v.get("length_seconds") or 0 for v in vods)
    est_download   = total_duration / DOWNLOAD_SPEED_X
    est_whisper    = total_duration / speed_x

    print(f"[INFO] {len(vods)} VODs  |  duración total: {fmt_seconds(total_duration)}")
    print(f"       Estimado descarga:  ~{fmt_seconds(est_download)}")
    print(f"       Estimado Whisper ({model_name}  {'GPU' if use_gpu else 'CPU'}): ~{fmt_seconds(est_whisper)}")
    print(f"       Estimado total:    ~{fmt_seconds(est_download + est_whisper)}\n")

    global_start = time.time()
    success, failed = [], []

    for vod in vods:
        vod_id = vod["id"]
        duration_s = vod.get("length_seconds")
        ok = process_vod(vod_id, model, model_name, duration_s, use_gpu)
        (success if ok else failed).append(vod_id)

    elapsed_total = time.time() - global_start
    print(f"\n{'═'*55}")
    print(f"Completado en {fmt_elapsed(elapsed_total)}: {len(success)} exitosos  |  {len(failed)} fallidos")
    if failed:
        print(f"Fallidos: {failed}")


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Transcribe VODs de Twitch con faster-whisper (int8/float16) y sube al backend"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--vod", metavar="VOD_ID", help="ID del VOD a procesar")
    group.add_argument("--all", action="store_true", help="Procesar todos los VODs en la BD")
    parser.add_argument(
        "--model",
        default="turbo",
        choices=["tiny", "base", "small", "medium", "large", "large-v2", "large-v3", "turbo"],
        help="Modelo Whisper a usar (default: turbo)",
    )
    args = parser.parse_args()
    model_name = args.model

    print(f"[INFO] Cargando faster-whisper '{model_name}'...")
    from faster_whisper import WhisperModel
    try:
        import torch
        use_gpu = torch.cuda.is_available()
    except ImportError:
        use_gpu = False

    if use_gpu:
        import torch
        gpu_name = torch.cuda.get_device_name(0)
        vram = torch.cuda.get_device_properties(0).total_memory / 1024**3
        print(f"[INFO] GPU detectada: {gpu_name} ({vram:.1f}GB VRAM) — usando CUDA float16")
        device, compute_type = "cuda", "float16"
    else:
        print(f"[INFO] No se detectó GPU — usando CPU int8")
        device, compute_type = "cpu", "int8"

    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    print(f"[INFO] Modelo listo.\n")

    if args.vod:
        run_single(args.vod, model, model_name, use_gpu)
    else:
        run_all(model, model_name, use_gpu)


if __name__ == "__main__":
    main()
