# install_tts_final.ps1
# Instala o Coqui TTS no Windows SEM precisar compilar extensoes C/Cython.
# Estrategia: clona o repo e instala em modo editable com a extensao pre-compilada desabilitada.

$ErrorActionPreference = "Stop"
$venv   = "C:\Users\Rauls\.venv_tts"
$python = "$venv\Scripts\python.exe"
$pip    = "$venv\Scripts\pip.exe"
$cloneDir = "C:\Users\Rauls\TTS-src"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  TTS Install (sem compilacao C++)"        -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# ── Passo 1: verifica venv
if (-not (Test-Path "$venv\Scripts\python.exe")) {
    Write-Host "ERRO: venv nao encontrado em $venv" -ForegroundColor Red
    Write-Host "Execute setup_tts.ps1 primeiro para criar o venv." -ForegroundColor Yellow
    exit 1
}
Write-Host ""
Write-Host "venv encontrado. Python:" -ForegroundColor Green
& $python --version

# ── Passo 2: clone do repositorio TTS (tag v0.22.0)
Write-Host ""
Write-Host "[1/4] Clonando repositorio TTS v0.22.0..." -ForegroundColor Yellow

if (Test-Path $cloneDir) {
    Write-Host "      Diretorio ja existe, removendo versao antiga..." -ForegroundColor DarkGray
    Remove-Item -Recurse -Force $cloneDir
}

git clone --depth 1 --branch v0.22.0 https://github.com/coqui-ai/TTS.git $cloneDir
Write-Host "      Clone concluido." -ForegroundColor Green

# ── Passo 3: patch — desabilita a compilacao da extensao Cython no Windows
#
# O monotonic_align/core.pyx so e usado por modelos antigos (GlowTTS, etc.).
# O XTTS v2 NAO usa essa extensao — ela e carregada opcionalmente.
# Substituimos o setup.py por uma versao que ignora a compilacao no Windows.
#
Write-Host ""
Write-Host "[2/4] Aplicando patch para ignorar compilacao Cython no Windows..." -ForegroundColor Yellow

$alignDir = "$cloneDir\TTS\tts\utils\monotonic_align"

# Substitui o __init__.py para usar fallback puro Python (ja existe no repo)
$initContent = @'
# monotonic_align/__init__.py — Windows-safe version
# The Cython extension (core.pyd) is optional and only used by GlowTTS/AlignTTS.
# XTTS v2 does NOT require it. We provide a pure-Python fallback.
import numpy as np

def maximum_path(value, mask):
    """Pure-Python fallback for monotonic alignment search."""
    value = value * mask
    device = value.device
    dtype = value.dtype
    value = value.cpu().detach().numpy().astype(np.float32)
    mask = mask.cpu().detach().numpy().astype(np.int32)
    b, t_x, t_y = value.shape
    paths = np.zeros_like(value, dtype=np.int32)
    import torch
    for i in range(b):
        v = value[i]
        m = mask[i]
        paths[i] = _maximum_path_c(v, m)
    return torch.from_numpy(paths).to(device=device, dtype=dtype)

def _maximum_path_c(value, mask):
    b, t_x, t_y = value.shape[0], mask.sum(0)[0], mask.sum(1)[0]
    path = np.zeros_like(value, dtype=np.int32)
    for y in range(t_y):
        for x in range(t_x):
            if x == 0:
                v_cur = -1e9 if y > 0 else 0.0
            else:
                v_cur = value[x-1, y]
            if y == 0:
                v_prev = value[x, 0] if x > 0 else 0.0
            else:
                v_prev = value[x, y-1]
            path[x, y] = 1 if v_cur > v_prev else 0
    return path
'@

Set-Content -Path "$alignDir\__init__.py" -Encoding UTF8 -Value $initContent

# Substitui o setup.py por um que nao compila nada
$setupContent = @'
from setuptools import setup
# No-op setup — Cython extension skipped on Windows (not required for XTTS v2)
setup(name="monotonic_align", version="0.0.1")
'@
Set-Content -Path "$alignDir\setup.py" -Encoding UTF8 -Value $setupContent

Write-Host "      Patch aplicado." -ForegroundColor Green

# ── Passo 4: instala o TTS do diretorio local (sem build da extensao)
Write-Host ""
Write-Host "[3/4] Instalando TTS do codigo-fonte (sem compilacao)..." -ForegroundColor Yellow

# Instala dependencias primeiro para evitar resolver conflitos durante o install
& $pip install numpy==1.26.4 Cython --quiet

# Instala TTS em modo normal (nao editable) a partir do source clonado
# --no-build-isolation garante que usa o numpy/cython ja instalados
& $pip install "$cloneDir" --no-build-isolation

Write-Host "      TTS instalado." -ForegroundColor Green

# ── Passo 5: instala dependencias extras
Write-Host ""
Write-Host "[4/4] Instalando soundfile, pydub, tqdm, requests..." -ForegroundColor Yellow
& $pip install soundfile pydub tqdm requests --quiet
Write-Host "      OK." -ForegroundColor Green

# ── Verificacao final
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Verificacao"                              -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$tmpCheck = "$env:TEMP\check_final_$PID.py"
Set-Content -Path $tmpCheck -Encoding UTF8 -Value @"
import torch
print("  PyTorch :", torch.__version__)
print("  CUDA    :", torch.cuda.is_available())

try:
    from TTS.api import TTS
    print("  TTS     : OK")
except Exception as e:
    print("  TTS     : ERRO -", str(e))

try:
    from TTS.tts.models.xtts import Xtts
    print("  XTTS v2 : OK (modelo importavel)")
except Exception as e:
    print("  XTTS v2 : ERRO -", str(e))
"@
& $python $tmpCheck
Remove-Item $tmpCheck -ErrorAction SilentlyContinue

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Concluido!" -ForegroundColor Green
Write-Host ""
Write-Host "PROXIMOS PASSOS:" -ForegroundColor White
Write-Host ""
Write-Host "  1. Ative o venv:"
Write-Host "     $venv\Scripts\Activate.ps1" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "  2. Confirme CUDA (com venv ativo):"
Write-Host "     python -c `"import torch; print(torch.cuda.is_available())`"" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "  3. Gere o primeiro audio:"
Write-Host "     python voice_engine.py --ref referencia.mp3 --text `"Sistemas operacionais, Senhor.`" --out output.wav" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "  NOTA: Na 1a execucao o modelo XTTS v2 (~1.9 GB) e baixado automaticamente." -ForegroundColor DarkGray
Write-Host ""
