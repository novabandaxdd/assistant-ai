#!/usr/bin/env python3
"""
jarvis_voice_server.py
──────────────────────
Servidor HTTP local para síntese de voz JARVIS via XTTS v2.
Mantém o modelo em memória entre chamadas — sem reload de 14s a cada frase.

Uso:
    python jarvis_voice_server.py --ref referencia.mp3 --port 5432

Endpoints:
    POST /speak   { "text": "...", "language": "pt" }  -> audio/wav
    GET  /health  -> { "status": "ok", "device": "cpu|cuda" }
    POST /unload  -> descarrega modelo da memória
"""

import argparse
import gc
import json
import logging
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("JarvisVoiceServer")

# ── Global state ──────────────────────────────────────────────────────────────
_model       = None
_model_lock  = threading.Lock()
_ref_audio   = None
_device      = "cpu"
_model_name  = "tts_models/multilingual/multi-dataset/xtts_v2"
_synth_lock  = threading.Semaphore(1)  # one synthesis at a time (model not thread-safe)


def _detect_device() -> str:
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
    except ImportError:
        pass
    return "cpu"


def _load_model():
    global _model, _device
    with _model_lock:
        if _model is not None:
            return _model
        log.info("Carregando modelo %s em '%s'...", _model_name, _device)
        from TTS.api import TTS  # type: ignore
        tts = TTS(model_name=_model_name, gpu=(_device == "cuda"))
        _model = tts
        log.info("Modelo carregado.")
        return _model


def _unload_model():
    global _model
    with _model_lock:
        if _model is None:
            return
        del _model
        _model = None
        gc.collect()
        try:
            import torch
            torch.cuda.empty_cache()
        except Exception:
            pass
    log.info("Modelo descarregado.")


def _synthesize(text: str, language: str = "pt") -> bytes:
    """Synthesize text and return raw WAV bytes via a temp file."""
    model = _load_model()
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_path = tmp.name
    tmp.close()
    try:
        # Semaphore: requests queue here, model runs one at a time
        with _synth_lock:
            model.tts_to_file(
                text=text,
                speaker_wav=_ref_audio,
                language=language,
                file_path=tmp_path,
            )
        with open(tmp_path, "rb") as f:
            return f.read()
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ── HTTP handler ──────────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):  # suppress default access log noise
        pass

    def _send_json(self, code: int, data: dict):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _send_wav(self, wav_bytes: bytes):
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(wav_bytes)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(wav_bytes)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {
                "status": "ok",
                "device": _device,
                "model_loaded": _model is not None,
            })
        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body   = self.rfile.read(length)

        if self.path == "/speak":
            try:
                data     = json.loads(body)
                text     = data.get("text", "").strip()
                language = data.get("language", "pt")
                if not text:
                    self._send_json(400, {"error": "text is required"})
                    return
                log.info("Sintetizando: %r", text[:80])
                wav = _synthesize(text, language)
                self._send_wav(wav)
            except Exception as exc:
                log.exception("Erro na síntese")
                self._send_json(500, {"error": str(exc)})

        elif self.path == "/unload":
            _unload_model()
            self._send_json(200, {"status": "unloaded"})

        else:
            self._send_json(404, {"error": "not found"})


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    global _ref_audio, _device

    parser = argparse.ArgumentParser(description="JARVIS XTTS v2 voice server")
    parser.add_argument("--ref",    required=True, help="Caminho para o áudio de referência (.mp3/.wav)")
    parser.add_argument("--port",   type=int, default=5432, help="Porta HTTP (padrão: 5432)")
    parser.add_argument("--host",   default="127.0.0.1", help="Host (padrão: 127.0.0.1)")
    parser.add_argument("--warmup", action="store_true", help="Pré-carrega o modelo ao iniciar")
    args = parser.parse_args()

    _ref_audio = args.ref
    _device    = _detect_device()

    log.info("━" * 60)
    log.info("  JARVIS Voice Server — XTTS v2")
    log.info("━" * 60)
    log.info("  Referência : %s", _ref_audio)
    log.info("  Dispositivo: %s", _device.upper())
    log.info("  Endereço   : http://%s:%d", args.host, args.port)
    log.info("━" * 60)

    if args.warmup:
        log.info("Pré-aquecendo modelo...")
        _load_model()

    server = HTTPServer((args.host, args.port), Handler)
    log.info("Servidor pronto. Aguardando requisições...")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Encerrando servidor.")
        sys.exit(0)


if __name__ == "__main__":
    main()
