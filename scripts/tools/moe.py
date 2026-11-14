"""95% margin of error for a weighted country estimate, shared by the survey
aggregators (columns <item>_moe, in the estimate's own units).

Effective sample size by Kish, n_eff = (sum w)^2 / sum w^2: it allows for the
weighting but not for clustering, so the true margin is somewhat wider —
the charts say "about". Shares: 1.96 * sqrt(p(1-p)/n_eff) * 100 (in points);
means: 1.96 * weighted SD / sqrt(n_eff).
"""
import math


def kish(w):
    s2 = float((w ** 2).sum())
    return float(w.sum()) ** 2 / s2 if s2 > 0 else 0.0


def share_moe(pct, w_base):
    """pct: the published share in percent; w_base: weights of the base."""
    n = kish(w_base)
    if not n or pct == '' or pct is None:
        return ''
    p = float(pct) / 100
    return f'{196 * math.sqrt(max(p * (1 - p), 0) / n):.4f}'


def mean_moe(v, w):
    n = kish(w)
    if not n:
        return ''
    m = float((v * w).sum() / w.sum())
    var = float((w * (v - m) ** 2).sum() / w.sum())
    return f'{1.96 * math.sqrt(var / n):.4f}'
