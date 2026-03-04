#!/bin/bash
# Setup para ejecutar upload_transcripts.py en una máquina nueva
set -e

echo "=== Verificando dependencias del sistema ==="

# ffmpeg (requerido por Whisper para leer audio)
if ! command -v ffmpeg &>/dev/null; then
    echo "Instalando ffmpeg..."
    if command -v apt-get &>/dev/null; then
        sudo apt-get install -y ffmpeg
    elif command -v brew &>/dev/null; then
        brew install ffmpeg
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y ffmpeg
    else
        echo "ERROR: Instala ffmpeg manualmente: https://ffmpeg.org/download.html"
        exit 1
    fi
else
    echo "✓ ffmpeg $(ffmpeg -version 2>&1 | head -1 | awk '{print $3}')"
fi

# yt-dlp
if ! command -v yt-dlp &>/dev/null; then
    echo "Instalando yt-dlp..."
    pip install yt-dlp
else
    echo "✓ yt-dlp $(yt-dlp --version)"
fi

echo ""
echo "=== Instalando paquetes Python ==="
pip install -r requirements_transcribe.txt

echo ""
echo "=== Verificando instalación ==="
python3 -c "import whisper; print('✓ openai-whisper', whisper.__version__ if hasattr(whisper, '__version__') else 'OK')"
python3 -c "import tqdm; print('✓ tqdm', tqdm.__version__)"
python3 -c "import requests; print('✓ requests', requests.__version__)"

# GPU check
python3 - <<'EOF'
try:
    import torch
    if torch.cuda.is_available():
        print(f"✓ GPU disponible: {torch.cuda.get_device_name(0)} — Whisper será mucho más rápido")
        print(f"  Usa --model large para mejor calidad sin sacrificar velocidad")
    else:
        print("⚠ No se detectó GPU — Whisper correrá en CPU (más lento)")
        print("  Recomendado: --model turbo  (mejor balance velocidad/calidad en CPU)")
except ImportError:
    print("⚠ torch no instalado, Whisper usará CPU")
EOF

echo ""
echo "=== Todo listo ==="
echo "Uso:"
echo "  python3 upload_transcripts.py --vod 2693745290"
echo "  python3 upload_transcripts.py --all"
echo "  python3 upload_transcripts.py --all --model turbo"
