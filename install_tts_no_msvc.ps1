# install_tts_no_msvc.ps1
# Instala TTS v0.22.0 sem Microsoft C++ Build Tools.
# Requer: Python 3.11 venv em .venv_tts, git instalado.

$ErrorActionPreference = "Stop"
$BASE    = "C:\Users\Rauls"
$VENV    = "$BASE\.venv_tts"
$PY      = "$VENV\Scripts\python.exe"
$PIP     = "$VENV\Scripts\pip.exe"
$TTSDIR  = "$BASE\TTS-src"
$SCRIPTS = "$BASE"   # where the helper .py files live

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function OK($msg)        { Write-Host "  OK : $msg" -ForegroundColor Green }
function Fail($msg)      { Write-Host "  ERR: $msg" -ForegroundColor Red; exit 1 }

# ── 0. Pre-requisitos ─────────────────────────────────────────────────────────
Step 0 "Verificando pre-requisitos"
if (-not (Test-Path $PY))  { Fail "venv nao encontrado em $VENV" }
$v = & $PY --version 2>&1;  OK "Python : $v"
try   { $g = git --version 2>&1; OK "Git    : $g" }
catch { Fail "git nao encontrado. Instale com: winget install Git.Git" }

if (-not (Test-Path "$SCRIPTS\monotonic_align_fallback.py")) {
    Fail "Arquivo monotonic_align_fallback.py nao encontrado em $SCRIPTS. Copie os arquivos auxiliares primeiro."
}
OK "Arquivos auxiliares encontrados"

# ── 1. Clonar TTS v0.22.0 ─────────────────────────────────────────────────────
Step 1 "Clonando TTS v0.22.0"
if (Test-Path $TTSDIR) {
    Write-Host "  Pasta existente — removendo..." -ForegroundColor Yellow
    Remove-Item $TTSDIR -Recurse -Force
}
git clone --depth 1 --branch v0.22.0 https://github.com/coqui-ai/TTS.git $TTSDIR 2>&1
if (-not (Test-Path "$TTSDIR\setup.py")) { Fail "Clone falhou" }
OK "Clone concluido"

# ── 2. Patch setup.py — zerar ext_modules ────────────────────────────────────
Step 2 "Removendo extensao Cython do setup.py"
$raw = [System.IO.File]::ReadAllText("$TTSDIR\setup.py")

# Remove linhas de import de Extension/Cython
$raw = ($raw -split "`n" | Where-Object {
    $_ -notmatch '^\s*from Cython' -and
    $_ -notmatch '^\s*import Cython' -and
    $_ -notmatch 'build_ext'
}) -join "`n"

# Zera o bloco ext_modules=[...] — substitui tudo entre [ e ] que contém Extension
$raw = [System.Text.RegularExpressions.Regex]::Replace(
    $raw,
    'ext_modules\s*=\s*\[[\s\S]*?\]',
    'ext_modules=[]',
    [System.Text.RegularExpressions.RegexOptions]::Multiline
)

[System.IO.File]::WriteAllText("$TTSDIR\setup.py", $raw)
OK "setup.py patcheado"

# ── 3. Patch pyproject.toml se existir ───────────────────────────────────────
Step 3 "Verificando pyproject.toml"
$ppPath = "$TTSDIR\pyproject.toml"
if (Test-Path $ppPath) {
    $pp = [System.IO.File]::ReadAllText($ppPath)
    $pp = $pp -replace '"Cython[^"]*"', '""' -replace "'Cython[^']*'", "''"
    [System.IO.File]::WriteAllText($ppPath, $pp)
    OK "pyproject.toml patcheado"
} else { OK "Nao existe — ignorado" }

# ── 4. Substituir monotonic_align pelo fallback puro-Python ──────────────────
Step 4 "Instalando fallback pure-Python para monotonic_align"
$maDir = "$TTSDIR\TTS\tts\utils\monotonic_align"

# Remover arquivos compilados/fonte Cython
Get-ChildItem $maDir -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in '.pyx','.c','.so','.pyd' } |
    Remove-Item -Force

# Copiar fallback Python como __init__.py
Copy-Item "$SCRIPTS\monotonic_align_fallback.py" "$maDir\__init__.py" -Force
OK "__init__.py (pure-Python) copiado"

# core.py stub para imports que referenciam .core
Copy-Item "$SCRIPTS\monotonic_align_core_stub.py" "$maDir\core.py" -Force
OK "core.py stub copiado"

# ── 5. Pre-instalar deps pesadas ──────────────────────────────────────────────
Step 5 "Pre-instalando dependencias"
& $PIP install "numpy==1.26.4" -q;             OK "numpy 1.26.4"
& $PIP install "Cython==3.0.10" -q;            OK "Cython"
& $PIP install coqpit -q;                      OK "coqpit"
& $PIP install "librosa>=0.10" soundfile -q;   OK "librosa + soundfile"
& $PIP install "scipy>=1.11" -q;               OK "scipy"
& $PIP install "transformers>=4.33.0" -q;      OK "transformers"

# ── 6. Instalar TTS sem compilar extensoes ───────────────────────────────────
Step 6 "Instalando TTS do fonte (sem extensoes Cython)"
$env:SETUPTOOLS_USE_DISTUTILS = "stdlib"

& $PIP install --no-build-isolation -e $TTSDIR
if ($LASTEXITCODE -ne 0) { Fail "pip install TTS falhou — veja log acima" }
OK "TTS instalado"

# ── 7. Verificacao final ──────────────────────────────────────────────────────
Step 7 "Verificacao final"

# Grava script de verificacao em arquivo separado para evitar here-string
$verifyScript = "$BASE\verify_tts.py"
$verifyContent = @(
    "import sys",
    "r = {}",
    "try:",
    "    import torch",
    "    r['PyTorch'] = torch.__version__",
    "    r['CUDA'] = str(torch.cuda.is_available())",
    "except Exception as e:",
    "    r['PyTorch'] = str(e)",
    "try:",
    "    from TTS.api import TTS",
    "    r['TTS'] = 'OK'",
    "except Exception as e:",
    "    r['TTS'] = str(e)",
    "try:",
    "    from TTS.tts.utils.monotonic_align import maximum_path",
    "    r['monotonic_align'] = 'OK (pure-Python)'",
    "except Exception as e:",
    "    r['monotonic_align'] = str(e)",
    "print('='*48)",
    "for k,v in r.items(): print(f'  {k:20s}: {v}')",
    "print('='*48)"
)
[System.IO.File]::WriteAllLines($verifyScript, $verifyContent)

& $PY $verifyScript

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  CONCLUIDO" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Proximos passos:"
Write-Host "  1. Ative o venv:"
Write-Host "       C:\Users\Rauls\.venv_tts\Scripts\Activate.ps1"
Write-Host "  2. Verifique CUDA:"
Write-Host "       python -c ""import torch; print(torch.cuda.is_available())"""
Write-Host "  3. Teste de sintese:"
Write-Host "       python voice_engine.py --ref referencia.mp3 --text ""Sistemas operacionais, Senhor."" --out output.wav"
Write-Host ""
