#!/usr/bin/env python3
"""
Descarga audio de VODs de Twitch, transcribe con Whisper y sube al backend.

Uso:
  python3 upload_transcripts.py --vod 2693745290     # Procesa un VOD específico
  python3 upload_transcripts.py --all                # Procesa todos los VODs en la BD
  python3 upload_transcripts.py --all --model large  # Usar modelo Whisper distinto
"""

import json
import argparse
import subprocess
import tempfile
import shutil
import sys
import time
import threading
import requests
from pathlib import Path
from tqdm import tqdm

# ─── CONFIGURACIÓN ───────────────────────────────────────────────────────────
API_BASE_URL  = "https://backend.permisossubtel.cl/api"
UPLOAD_URL    = f"{API_BASE_URL}/transcripts/upload/"
VIDEOS_URL    = f"{API_BASE_URL}/videos/"
CACHE_DIR     = Path("transcripts_cache")
# ─────────────────────────────────────────────────────────────────────────────

# Velocidad estimada de Whisper (segundos de audio por segundo real)
WHISPER_SPEED_CPU = {
    "tiny":           32.0,
    "tiny.en":        32.0,
    "base":           16.0,
    "base.en":        16.0,
    "small":           6.0,
    "small.en":        6.0,
    "medium":          2.0,
    "medium.en":       2.0,
    "large-v1":        1.0,
    "large-v2":        1.0,
    "large-v3":        1.0,
    "large":           1.0,
    "large-v3-turbo": 8.0,
    "turbo":           8.0,
}
# RTX 2060 Mobile (6GB VRAM) con fp16
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

# Velocidad estimada de descarga audio_only con 16 fragmentos paralelos
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
    """Formatea tiempo transcurrido para mostrar en pantalla."""
    return fmt_seconds(elapsed)


# ── Utilidades de API ──────────────────────────────────────────────────────────

def get_video_info(vod_id: str) -> dict | None:
    """Obtiene info del VOD desde la API (incluye length_seconds)."""
    try:
        resp = requests.get(f"{VIDEOS_URL}{vod_id}/", timeout=15)
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    return None


def get_all_vods() -> list[dict]:
    """Obtiene todos los VODs desde la API (maneja paginación)."""
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
    """
    Descarga solo el audio del VOD usando yt-dlp.
    Muestra la barra de progreso nativa de yt-dlp directamente en terminal.
    """
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
        "--progress",               # fuerza barra de progreso
        "--newline",                # una línea por update (más limpio en terminal)
        "-o", f"{dest}.%(ext)s",
        twitch_url,
    ]

    t0 = time.time()
    # Sin capture_output → yt-dlp imprime su barra nativa directamente
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
    """Transcribe con Whisper mostrando barra de progreso basada en tiempo estimado."""
    speed_table = WHISPER_SPEED_GPU if use_gpu else WHISPER_SPEED_CPU
    speed_x = speed_table.get(model_name, 35.0 if use_gpu else 2.0)
    est_seconds = int(duration_s / speed_x) if duration_s else None

    if est_seconds:
        print(f"  → Transcribiendo con Whisper '{model_name}'  (estimado: ~{fmt_seconds(est_seconds)})")
    else:
        print(f"  → Transcribiendo con Whisper '{model_name}'...")

    result_holder: list = []
    error_holder:  list = []

    def run():
        try:
            result_holder.append(model.transcribe(str(audio_path), fp16=use_gpu, verbose=False))
        except Exception as e:
            error_holder.append(e)

    t0 = time.time()
    worker = threading.Thread(target=run, daemon=True)
    worker.start()

    # Barra de progreso basada en tiempo estimado
    bar_total = est_seconds or 0
    bar = tqdm(
        total=bar_total if bar_total else None,
        unit="s",
        unit_scale=True,
        desc="    Whisper",
        bar_format="{l_bar}{bar}| {n:.0f}/{total:.0f}s [{elapsed}<{remaining}]" if bar_total else "{l_bar}{bar}| {elapsed}",
        dynamic_ncols=True,
    )

    last = 0
    while worker.is_alive():
        time.sleep(0.5)
        now = int(time.time() - t0)
        if bar_total:
            advance = min(now, bar_total) - last
        else:
            advance = now - last
        if advance > 0:
            bar.update(advance)
            last += advance

    worker.join()
    bar.close()

    elapsed = time.time() - t0

    if error_holder:
        raise error_holder[0]

    result = result_holder[0]
    entries = []
    for seg in result.get("segments", []):
        entries.append({
            "Text":    seg["text"].strip(),
            "StartMs": int(seg["start"] * 1000),
            "EndMs":   int(seg["end"]   * 1000),
        })

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
    speed_x = speed_table.get(model_name, 35.0 if use_gpu else 2.0)
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
        description="Transcribe VODs de Twitch con Whisper y sube al backend"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--vod", metavar="VOD_ID", help="ID del VOD a procesar")
    group.add_argument("--all", action="store_true", help="Procesar todos los VODs en la BD")
    parser.add_argument(
        "--model",
        default="medium",
        choices=["tiny", "base", "small", "medium", "large", "large-v2", "large-v3", "turbo"],
        help="Modelo Whisper a usar (default: medium)",
    )
    args = parser.parse_args()
    model_name = args.model

    print(f"[INFO] Cargando modelo Whisper '{model_name}'...")
    import whisper
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cuda":
        gpu_name = torch.cuda.get_device_name(0)
        vram = torch.cuda.get_device_properties(0).total_memory / 1024**3
        print(f"[INFO] GPU detectada: {gpu_name} ({vram:.1f}GB VRAM) — usando CUDA")
    else:
        print(f"[INFO] No se detectó GPU — usando CPU")
    use_gpu = (device == "cuda")
    model = whisper.load_model(model_name, device=device)
    print(f"[INFO] Modelo listo.\n")

    if args.vod:
        run_single(args.vod, model, model_name, use_gpu)
    else:
        run_all(model, model_name, use_gpu)


if __name__ == "__main__":
    main()
