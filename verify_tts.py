r = {}
try:
    import torch
    r["PyTorch"] = torch.__version__
    r["CUDA"] = str(torch.cuda.is_available())
except Exception as e:
    r["PyTorch"] = str(e)
try:
    from TTS.api import TTS
    r["TTS"] = "OK"
except Exception as e:
    r["TTS"] = str(e)
try:
    from TTS.tts.utils.monotonic_align import maximum_path
    r["monotonic_align"] = "OK (pure-Python)"
except Exception as e:
    r["monotonic_align"] = str(e)
print("=" * 40)
for k, v in r.items():
    print("  " + k + ": " + v)
print("=" * 40)
