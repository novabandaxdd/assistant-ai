"""
monotonic_align -- pure-Python/NumPy fallback (no Cython required).
Used by older Coqui TTS models (GlowTTS, AlignTTS).
XTTS v2 does NOT use this module at all.
"""
import numpy as np


def maximum_path_numpy(value, mask):
    value = value * mask
    b, t_x, t_y = value.shape
    path = np.zeros_like(value, dtype=np.int32)

    for i in range(b):
        v = value[i]
        m = mask[i]
        x_len = int(m[:, 0].sum())
        y_len = int(m[0, :].sum())

        dp = np.full((x_len + 1, y_len + 1), -np.inf, dtype=np.float32)
        dp[0, 0] = 0.0
        for s in range(x_len):
            for t in range(y_len):
                v_stay = dp[s, t + 1] if t + 1 <= y_len else -np.inf
                v_next = dp[s, t]     if t     <= y_len else -np.inf
                dp[s + 1, t + 1] = v[s, t] + max(v_stay, v_next)

        p = np.zeros((x_len, y_len), dtype=np.int32)
        s, t = x_len - 1, y_len - 1
        while s >= 0 and t >= 0:
            p[s, t] = 1
            if s == 0:
                t -= 1
            elif t == 0:
                s -= 1
            elif dp[s, t] >= dp[s, t + 1]:
                s -= 1
            else:
                t -= 1

        path[i, :x_len, :y_len] = p

    return path


def maximum_path(value, mask):
    try:
        import torch
        if isinstance(value, torch.Tensor):
            np_val  = value.detach().cpu().numpy()
            np_mask = mask.detach().cpu().numpy()
            result  = maximum_path_numpy(np_val, np_mask)
            return torch.from_numpy(result).to(value.device)
    except ImportError:
        pass
    return maximum_path_numpy(value, mask)
