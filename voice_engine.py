"""
voice_engine.py
───────────────────────────────────────────────────────────────────────────────
Módulo de síntese de voz (TTS) com clonagem Zero-Shot via Coqui XTTS v2.

Replicação de voz a partir de um áudio de referência, estilo assistente
executivo — tom masculino, grave, maduro, calmo e com ritmo cadenciado.

Requisitos:
    Python 3.10+  |  ver requirements.txt para dependências

Uso básico:
    from voice_engine import VoiceSynthesizer

    synth = VoiceSynthesizer()
    synth.speak(
        text="Sistemas operacionais, Senhor. Aguardando instruções.",
        output_path="resposta.wav",
        reference_audio_path="referencia.wav",
    )

Autor: gerado por Bob (IBM) para pipeline de agente pessoal.
"""

from __future__ import annotations

import gc
import logging
import os
import sys
import time
from pathlib import Path
from typing import Optional

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("VoiceEngine")


# ─────────────────────────────────────────────────────────────────────────────
# Device detection — CUDA → ROCm/HIP → MPS → CPU
# ─────────────────────────────────────────────────────────────────────────────

def _detect_device() -> str:
    """
    Retorna o melhor dispositivo disponível nesta ordem de prioridade:
      1. CUDA   — GPUs Nvidia (Linux / Windows)
      2. ROCm   — GPUs AMD   (Linux / Windows com PyTorch+ROCm)
      3. MPS    — Apple Silicon M1–M4 (macOS 12.3+)
      4. CPU    — fallback universal

    A distinção CUDA vs ROCm é transparente ao PyTorch: ambas expõem
    "cuda" como backend. Verificamos o nome do dispositivo para logar
    corretamente, mas o valor retornado é sempre "cuda" quando GPU estiver
    disponível via torch.
    """
    try:
        import torch  # importado aqui para evitar erro se torch não estiver instalado

        # ── CUDA / ROCm (ambos retornam is_available() == True via torch)
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            backend  = "ROCm/HIP" if _is_rocm_build(torch) else "CUDA"
            logger.info("GPU detectada (%s): %s", backend, gpu_name)
            return "cuda"

        # ── MPS (Apple Silicon)
        if sys.platform == "darwin":
            if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                logger.info("Apple MPS detectado — usando Metal Performance Shaders.")
                return "mps"

        # ── CPU fallback
        logger.warning(
            "Nenhuma GPU detectada. Usando CPU — a geração será mais lenta."
        )
        return "cpu"

    except ImportError:
        logger.error(
            "PyTorch não encontrado. Instale conforme o requirements.txt e tente novamente."
        )
        raise


def _is_rocm_build(torch_module) -> bool:
    """Verifica se o build do PyTorch foi compilado com suporte a ROCm/HIP."""
    version_str = getattr(torch_module, "version", {})
    hip_version  = getattr(version_str, "hip", None)
    return hip_version is not None


# ─────────────────────────────────────────────────────────────────────────────
# VoiceSynthesizer
# ─────────────────────────────────────────────────────────────────────────────

class VoiceSynthesizer:
    """
    Sintetizador de voz com clonagem Zero-Shot via Coqui XTTS v2.

    O modelo é carregado UMA ÚNICA VEZ no construtor e reutilizado em
    chamadas subsequentes a `speak()`, evitando overhead de re-carregamento.

    Para liberar VRAM/RAM explicitamente chame `unload()` ou use o
    gerenciador de contexto `with VoiceSynthesizer() as synth:`.

    Parâmetros de instância
    -----------------------
    language : str
        Idioma de síntese. Padrão "pt" (Português).
        Outros suportados pelo XTTS v2: "en", "es", "fr", "de", "it",
        "pl", "tr", "ru", "nl", "cs", "ar", "zh-cn", "ja", "hu", "ko".
    temperature : float
        Controla a variabilidade prosódica.
        • 0.1–0.4 → fala mais robótica / uniforme
        • 0.5–0.7 → equilíbrio natural (RECOMENDADO para estilo executivo)
        • 0.8–1.0 → mais expressivo / imprevisível
        Padrão: 0.55
    speed : float
        Fator de velocidade de fala.
        • < 1.0  → mais lento (ex: 0.85 para ritmo cadenciado/pausado)
        • 1.0    → velocidade natural do speaker de referência
        • > 1.0  → mais rápido
        Padrão: 0.88 (levemente desacelerado, articulação clara)
    repetition_penalty : float
        Penalidade para repetições de tokens no decodificador.
        Valores maiores (> 2.0) reduzem gagueira em textos longos.
        Padrão: 2.5
    top_k : int
        Limita o sampling ao top-K tokens mais prováveis.
        Valores baixos (20–50) tornam a síntese mais focada.
        Padrão: 40
    top_p : float
        Nucleus sampling — acumula tokens até probabilidade cumulativa p.
        Padrão: 0.85
    model_name : str
        Nome do modelo no repositório Coqui HuggingFace.
        Padrão: "tts_models/multilingual/multi-dataset/xtts_v2"
    """

    # Nome completo do modelo XTTS v2 no índice Coqui
    DEFAULT_MODEL = "tts_models/multilingual/multi-dataset/xtts_v2"

    def __init__(
        self,
        language:           str   = "pt",   # pt = Português (pt-BR e pt-PT — XTTS v2 não separa dialetos,
                                            #      mas treina melhor com falantes nativos brasileiros)
        temperature:        float = 0.55,
        speed:              float = 0.88,
        repetition_penalty: float = 2.5,
        top_k:              int   = 40,
        top_p:              float = 0.85,
        model_name:         str   = DEFAULT_MODEL,
    ) -> None:
        self.language           = language
        self.temperature        = temperature
        self.speed              = speed
        self.repetition_penalty = repetition_penalty
        self.top_k              = top_k
        self.top_p              = top_p
        self.model_name         = model_name

        self._device: str             = _detect_device()
        self._tts:    Optional[object] = None   # instância do TTS, carregada lazy

        logger.info(
            "VoiceSynthesizer inicializado — dispositivo: %s | idioma: %s | "
            "temperatura: %.2f | velocidade: %.2f",
            self._device, self.language, self.temperature, self.speed,
        )

    # ── Carregamento lazy do modelo ───────────────────────────────────────────

    def _load_model(self) -> None:
        """Carrega o XTTS v2 na memória (executado apenas uma vez)."""
        if self._tts is not None:
            return  # já carregado

        try:
            from TTS.api import TTS  # type: ignore[import]
        except ImportError as exc:
            raise ImportError(
                "A biblioteca 'TTS' (Coqui) não está instalada.\n"
                "Execute: pip install TTS\n"
                "Veja requirements.txt para instruções completas."
            ) from exc

        logger.info("Carregando modelo %s em '%s'…", self.model_name, self._device)
        t0 = time.perf_counter()

        # progress_bar=False evita logs desnecessários em pipelines
        self._tts = TTS(
            model_name=self.model_name,
            progress_bar=False,
        ).to(self._device)

        elapsed = time.perf_counter() - t0
        logger.info("Modelo carregado em %.1fs.", elapsed)

    # ── API pública ───────────────────────────────────────────────────────────

    def speak(
        self,
        text:                 str,
        output_path:          str | os.PathLike,
        reference_audio_path: str | os.PathLike,
    ) -> Path:
        """
        Sintetiza `text` clonando a voz de `reference_audio_path` e salva
        o resultado em `output_path` (formato WAV, 24 kHz mono).

        Parâmetros
        ----------
        text : str
            Texto a ser sintetizado. Pode conter pontuação normal; o modelo
            segmenta sentenças longas automaticamente.
        output_path : str | Path
            Caminho de saída do arquivo de áudio (ex: "resposta.wav").
            O diretório pai será criado automaticamente se não existir.
        reference_audio_path : str | Path
            Áudio de referência para clonagem Zero-Shot (.wav ou .mp3).
            Duração ideal: 6–30 segundos de fala limpa, sem ruído de fundo.

        Retorna
        -------
        Path
            Caminho absoluto do arquivo gerado.

        Exceções
        --------
        FileNotFoundError
            Se `reference_audio_path` não existir.
        ValueError
            Se `text` for vazio.
        RuntimeError
            Em falhas de síntese ou VRAM insuficiente.
        """
        # ── Validações de entrada
        if not text or not text.strip():
            raise ValueError("O parâmetro 'text' não pode ser vazio.")

        ref_path = Path(reference_audio_path).resolve()
        if not ref_path.exists():
            raise FileNotFoundError(
                f"Áudio de referência não encontrado: {ref_path}\n"
                "Forneça um arquivo .wav ou .mp3 de 6–30 segundos."
            )

        out_path = Path(output_path).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)

        # ── Garante que o modelo está carregado
        self._load_model()

        logger.info(
            "Sintetizando %d caractere(s) | ref: %s | saída: %s",
            len(text), ref_path.name, out_path.name,
        )
        t0 = time.perf_counter()

        try:
            # tts_to_file clona a voz de speaker_wav e grava direto em file_path
            self._tts.tts_to_file(  # type: ignore[union-attr]
                text=text,
                file_path=str(out_path),
                speaker_wav=str(ref_path),
                language=self.language,
                # ── Parâmetros de qualidade e ritmo ──────────────────────────
                # split_sentences=True garante pausas naturais entre frases
                split_sentences=True,
                # Parâmetros passados ao gerador interno do XTTS v2
                # via **kwargs → config do decoder
                temperature=self.temperature,
                speed=self.speed,
                repetition_penalty=self.repetition_penalty,
                top_k=self.top_k,
                top_p=self.top_p,
            )
        except Exception as exc:
            # Loga a exceção completa antes de re-raise
            logger.error("Falha na síntese: %s", exc, exc_info=True)
            # Libera memória mesmo em caso de erro
            self._release_gpu_cache()
            raise RuntimeError(f"Erro durante a síntese de voz: {exc}") from exc

        elapsed = time.perf_counter() - t0
        file_size_kb = out_path.stat().st_size / 1024

        logger.info(
            "Áudio gerado em %.2fs → %s (%.1f KB)",
            elapsed, out_path.name, file_size_kb,
        )

        # Libera cache de GPU após cada geração para evitar acúmulo de VRAM
        self._release_gpu_cache()

        return out_path

    # ── Gerenciamento de memória ──────────────────────────────────────────────

    def _release_gpu_cache(self) -> None:
        """
        Libera o cache de tensores alocados na GPU sem descarregar o modelo.
        Útil para evitar OOM em gerações sequenciais longas.
        """
        try:
            import torch
            if self._device == "cuda":
                torch.cuda.empty_cache()
                torch.cuda.synchronize()
                logger.debug("Cache CUDA liberado.")
            elif self._device == "mps":
                # MPS não tem empty_cache estável em todas as versões;
                # gc.collect() é suficiente na maioria dos casos.
                pass
        except ImportError:
            pass
        finally:
            gc.collect()

    def unload(self) -> None:
        """
        Descarrega o modelo da VRAM/RAM completamente.
        Chame quando não for mais necessário gerar áudio na sessão atual,
        ou para liberar recursos antes de um processo computacionalmente pesado.
        """
        if self._tts is None:
            return

        logger.info("Descarregando modelo da memória…")
        del self._tts
        self._tts = None

        self._release_gpu_cache()
        logger.info("Modelo descarregado. Memória liberada.")

    # ── Context manager (with statement) ─────────────────────────────────────

    def __enter__(self) -> "VoiceSynthesizer":
        return self

    def __exit__(self, *_) -> None:
        self.unload()

    def __repr__(self) -> str:
        status = "carregado" if self._tts else "não carregado"
        return (
            f"VoiceSynthesizer("
            f"device={self._device!r}, "
            f"lang={self.language!r}, "
            f"temp={self.temperature}, "
            f"speed={self.speed}, "
            f"model={status})"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Bloco de execução standalone — teste rápido do módulo
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Teste de síntese de voz com Coqui XTTS v2."
    )
    parser.add_argument(
        "--text",
        default="Sistemas operacionais, Senhor. Segunda memória ativa e pronta.",
        help="Texto a ser sintetizado.",
    )
    parser.add_argument(
        "--ref",
        default="referencia.mp3",
        help="Caminho para o áudio de referência (.wav ou .mp3).",
    )
    parser.add_argument(
        "--out",
        default="output.wav",
        help="Caminho de saída do arquivo gerado.",
    )
    parser.add_argument(
        "--lang",
        default="pt",
        help="Código do idioma (padrão: pt).",
    )
    parser.add_argument(
        "--speed",
        type=float,
        default=0.88,
        help="Fator de velocidade (padrão: 0.88 — levemente desacelerado).",
    )
    parser.add_argument(
        "--temp",
        type=float,
        default=0.55,
        help="Temperatura de amostragem (padrão: 0.55).",
    )
    args = parser.parse_args()

    print("\n" + "─" * 60)
    print("  JARVIS Voice Engine — Coqui XTTS v2")
    print("─" * 60)

    with VoiceSynthesizer(
        language=args.lang,
        speed=args.speed,
        temperature=args.temp,
    ) as synth:
        print(f"  Dispositivo : {synth._device.upper()}")
        print(f"  Referência  : {args.ref}")
        print(f"  Texto       : {args.text[:80]}{'…' if len(args.text) > 80 else ''}")
        print("─" * 60 + "\n")

        out = synth.speak(
            text=args.text,
            output_path=args.out,
            reference_audio_path=args.ref,
        )

    print(f"\n✓ Áudio salvo em: {out}")
