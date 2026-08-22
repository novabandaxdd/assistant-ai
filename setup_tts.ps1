# setup_tts.ps1 — Configura o ambiente do Voice Engine (Coqui XTTS v2)
# Execute: powershell -ExecutionPolicy Bypass -File setup_tts.ps1

$ErrorActionPreference = "Stop"
$venv   = "C:\Users\Rauls\.venv_tts"
$python = "$venv\Scripts\python.exe"
$pip    = "$venv\Scripts\pip.exe"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  JARVIS Voice Engine -- Setup"            -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# ── 1. Cria o venv com Python 3.11
Write-Host ""
Write-Host "[1/8] Criando venv com Python 3.11..." -ForegroundColor Yellow
if (Test-Path $venv) {
    Write-Host "      venv ja existe, pulando." -ForegroundColor DarkGray
} else {
    & py -3.11 -m venv $venv
    Write-Host "      OK." -ForegroundColor Green
}

# ── 2. Confirma versao
Write-Host ""
Write-Host "[2/8] Versao do Python no venv:" -ForegroundColor Yellow
& $python --version

# ── 3. Atualiza pip + ferramentas de build
Write-Host ""
Write-Host "[3/8] Atualizando pip, setuptools, wheel..." -ForegroundColor Yellow
& $python -m pip install --upgrade pip setuptools wheel --quiet
Write-Host "      OK." -ForegroundColor Green

# ── 4. Pre-instala Cython (obrigatorio antes do TTS)
Write-Host ""
Write-Host "[4/8] Instalando Cython (pre-requisito de build do TTS)..." -ForegroundColor Yellow
& $pip install "Cython>=0.29.30" --quiet
Write-Host "      OK." -ForegroundColor Green

# ── 5. Pre-instala numpy compativel com TTS 0.22
Write-Host ""
Write-Host "[5/8] Instalando numpy 1.26.4 (compativel com TTS)..." -ForegroundColor Yellow
& $pip install "numpy==1.26.4" --quiet
Write-Host "      OK." -ForegroundColor Green

# ── 6. Instala PyTorch com CUDA 12.4
Write-Host ""
Write-Host "[6/8] Instalando PyTorch 2.6 + CUDA 12.4..." -ForegroundColor Yellow
& $pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124
Write-Host "      OK." -ForegroundColor Green

# ── 7. Instala TTS e dependencias
#
# A ordem importa:
#   Cython ja instalado -> TTS consegue preparar metadata e compilar monotonic_align
#   numpy ja fixado     -> evita conflito com pandas<2.0
#
Write-Host ""
Write-Host "[7/8] Instalando Coqui TTS..." -ForegroundColor Yellow
& $pip install "TTS==0.22.0" soundfile pydub tqdm requests
Write-Host "      OK." -ForegroundColor Green

# ── 8. Verificacao — via arquivos .py temporarios (evita problemas de aspas no PS)
Write-Host ""
Write-Host "[8/8] Verificacao final..." -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Cyan

# -- Verifica PyTorch e CUDA
$tmpTorch = "$env:TEMP\check_torch_$PID.py"
Set-Content -Path $tmpTorch -Encoding UTF8 -Value @"
import torch
print("  PyTorch :", torch.__version__)
cuda = torch.cuda.is_available()
print("  CUDA    :", cuda)
if cuda:
    print("  GPU     :", torch.cuda.get_device_name(0))
    print("  VRAM    :", round(torch.cuda.get_device_properties(0).total_memory / 1e9, 1), "GB")
else:
    # CUDA False aqui no setup e normal — o driver nao e visivel para subprocessos
    # Sera detectado corretamente ao rodar voice_engine.py com o venv ativado
    print("  GPU     : nao detectado neste contexto (normal em subprocesso PS)")
    print("  Dica    : ative o venv e rode: python -c \"import torch; print(torch.cuda.is_available())\"")
"@
& $python $tmpTorch
Remove-Item $tmpTorch -ErrorAction SilentlyContinue

# -- Verifica TTS
$tmpTTS = "$env:TEMP\check_tts_$PID.py"
Set-Content -Path $tmpTTS -Encoding UTF8 -Value @"
try:
    from TTS.api import TTS
    print("  TTS     : OK (importado com sucesso)")
except Exception as e:
    print("  TTS     : ERRO -", str(e))
"@
& $python $tmpTTS
Remove-Item $tmpTTS -ErrorAction SilentlyContinue

Write-Host "==========================================" -ForegroundColor Cyan

# ── Instrucoes finais
Write-Host ""
Write-Host "Setup concluido!" -ForegroundColor Green
Write-Host ""
Write-Host "PROXIMOS PASSOS:" -ForegroundColor White
Write-Host ""
Write-Host "  1. Ative o venv (OBRIGATORIO antes de qualquer uso):"
Write-Host "     $venv\Scripts\Activate.ps1" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "  2. Confirme que CUDA esta ativo (deve retornar True):"
Write-Host "     python -c `"import torch; print(torch.cuda.is_available())`"" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "  3. Rode o teste de sintese:" 
Write-Host "     python voice_engine.py --ref referencia.mp3 --text `"Sistemas operacionais, Senhor.`" --out output.wav" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "  NOTA: Na primeira execucao o modelo XTTS v2 (~1.9 GB) sera baixado automaticamente."
Write-Host ""
