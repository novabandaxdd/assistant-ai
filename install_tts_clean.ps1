$ErrorActionPreference = "Continue"
$BASE   = "C:\Users\Rauls"
$VENV   = "$BASE\.venv_tts"
$PY     = "$VENV\Scripts\python.exe"
$PIP    = "$VENV\Scripts\pip.exe"
$TTSDIR = "$BASE\TTS-src"

function Step($msg) { Write-Host "" ; Write-Host "[$msg]" -ForegroundColor Cyan }
function OK($msg)   { Write-Host "  OK : $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  ERR: $msg" -ForegroundColor Red ; exit 1 }

Step "0 - Pre-requisitos"
if (-not (Test-Path $PY)) { Fail "venv nao encontrado em $VENV" }
$v = & $PY --version 2>&1 ; OK "Python: $v"
try { $g = git --version 2>&1 ; OK "Git: $g" } catch { Fail "git nao encontrado" }
if (-not (Test-Path "$BASE\monotonic_align_fallback.py")) { Fail "monotonic_align_fallback.py nao encontrado em $BASE" }
OK "Arquivos auxiliares presentes"

Step "1 - Clonando TTS v0.22.0"
if (Test-Path $TTSDIR) { Remove-Item $TTSDIR -Recurse -Force }
$gitOut = git clone --depth 1 --branch v0.22.0 https://github.com/coqui-ai/TTS.git $TTSDIR 2>&1
if (-not (Test-Path "$TTSDIR\setup.py")) { Fail "Clone falhou - verifique conexao com internet" }
OK "Clone OK"

Step "2 - Substituindo setup.py por versao minima"
# Replace entirely — avoids all Cython/regex fragility
Copy-Item "$BASE\tts_setup_minimal.py" "$TTSDIR\setup.py" -Force
OK "setup.py substituido (versao minima sem Cython)"

Step "3 - Removendo pyproject.toml"
$ppPath = "$TTSDIR\pyproject.toml"
if (Test-Path $ppPath) {
    Remove-Item $ppPath -Force
    OK "pyproject.toml removido (pip usara setup.py)"
} else { OK "Nao existe - ignorado" }

Step "4 - Copiando fallback pure-Python"
$maDir = "$TTSDIR\TTS\tts\utils\monotonic_align"
Get-ChildItem $maDir -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in @(".pyx",".c",".so",".pyd") } |
    Remove-Item -Force
Copy-Item "$BASE\monotonic_align_fallback.py"  "$maDir\__init__.py" -Force
Copy-Item "$BASE\monotonic_align_core_stub.py" "$maDir\core.py"     -Force
OK "Fallback copiado"

Step "5 - Dependencias"
& $PIP install "numpy==1.26.4" -q           ; OK "numpy"
& $PIP install "Cython==3.0.10" -q          ; OK "Cython"
& $PIP install coqpit -q                    ; OK "coqpit"
& $PIP install "librosa>=0.10" soundfile -q ; OK "librosa+soundfile"
& $PIP install "scipy>=1.11" -q             ; OK "scipy"
& $PIP install "transformers>=4.33.0" -q    ; OK "transformers"

Step "6 - Instalando TTS"
$env:SETUPTOOLS_USE_DISTUTILS = "stdlib"
& $PIP install --no-build-isolation -e $TTSDIR
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { Fail "pip install TTS falhou" }
OK "TTS instalado"

Step "7 - Verificacao"
& $PY "$BASE\verify_tts.py"

Write-Host ""
Write-Host "CONCLUIDO" -ForegroundColor Green
Write-Host "  Ative o venv : $VENV\Scripts\Activate.ps1"
Write-Host "  Teste CUDA   : python -c `"import torch; print(torch.cuda.is_available())`""
Write-Host "  Sintese      : python voice_engine.py --ref referencia.mp3 --text `"Sistemas operacionais, Senhor.`" --out output.wav"
