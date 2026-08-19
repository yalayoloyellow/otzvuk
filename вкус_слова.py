#!/usr/bin/env python3
"""Что нравится yala — двумя способами.

1. Прототип вместо регрессии: при 33 положительных примерах на 512 измерений
   логистическая регрессия переобучается (разброс AUC по фолдам 0.44–0.77).
   Прототип — направление «среднее годных минус среднее негодных» — имеет
   ровно одну степень свободы и на малых данных обычно устойчивее.
2. Словами: CLAP держит звук и текст в общем пространстве, поэтому можно
   прямо спросить, какие описания ближе к принятым темам.
"""
import json
import os

import numpy as np
import torch
from transformers import ClapModel, ClapProcessor

STORE = os.path.expanduser("~/Documents/otzvuk")
SCRATCH = "/private/tmp/claude-502/-Users-yala/15a2ff36-fbf8-4b1e-9532-7ad769179edd/scratchpad/vkus.json"
NAME = "laion/clap-htsat-unfused"

СЛОВА = [
 "dark ambient drone","warm analog pad","bright plucked strings","distorted noise",
 "deep sub bass","metallic bell resonance","airy whispering texture","rhythmic percussive loop",
 "melancholic piano","dissonant experimental sound","smooth hip hop sample","techno rumble",
 "glitchy digital artifacts","choir voices","tape saturated lofi","clean sine tone",
 "harsh industrial","gentle evolving texture","punchy drum machine","psychedelic swirling",
 "human voice speaking","granular cloud","orchestral strings","muffled underwater sound",
 "sharp attack transient","slow tonal movement","chaotic random noise","hypnotic repetitive pattern",
]


def load():
    try:
        log = [json.loads(x) for x in open(os.path.join(STORE, "вкус.jsonl"), encoding="utf-8") if x.strip()]
    except OSError:
        log = json.load(open(SCRATCH, encoding="utf-8"))["rows"]
    emb = {}
    for x in open(os.path.join(STORE, "эмбеддинги.jsonl"), encoding="utf-8"):
        if x.strip():
            r = json.loads(x)
            emb[r["key"]] = np.array(r["v"], dtype=np.float32)
    return log, emb


def split(log, emb):
    good, bad, pairs = [], [], []
    for r in log:
        ka = f'{r["profile"]}_{r["seedA"] & 0xffffffff}'
        kb = f'{r["profile"]}_{r["seedB"] & 0xffffffff}'
        if ka not in emb or kb not in emb:
            continue
        a, b = emb[ka], emb[kb]
        pairs.append((a, b, r["win"]))
        if r["win"] == "a": good.append(a); bad.append(b)
        elif r["win"] == "b": good.append(b); bad.append(a)
        else: bad += [a, b]
    return np.array(good), np.array(bad), pairs


def prototype(good, bad):
    w = good.mean(0) - bad.mean(0)
    return w / (np.linalg.norm(w) + 1e-9)


def cv(pairs, folds=5):
    aucs = []
    for f in range(folds):
        tr = [p for i, p in enumerate(pairs) if i % folds != f]
        te = [p for i, p in enumerate(pairs) if i % folds == f]
        g, b = [], []
        for a, bb, w in tr:
            if w == "a": g.append(a); b.append(bb)
            elif w == "b": g.append(bb); b.append(a)
            else: b += [a, bb]
        if not g:
            continue
        wv = prototype(np.array(g), np.array(b))
        pos, neg = [], []
        for a, bb, w in te:
            sa, sb = float(a @ wv), float(bb @ wv)
            if w == "a": pos.append(sa); neg.append(sb)
            elif w == "b": pos.append(sb); neg.append(sa)
            else: neg += [sa, sb]
        if pos and neg:
            wins = sum((p > n) + .5 * (p == n) for p in pos for n in neg)
            aucs.append(wins / (len(pos) * len(neg)))
    return aucs


def main():
    log, emb = load()
    good, bad, pairs = split(log, emb)
    print(f"годных {len(good)}, негодных {len(bad)}")
    aucs = cv(pairs)
    print("прототип, AUC по фолдам:", [round(v, 3) for v in aucs])
    print("прототип, AUC средний:", round(float(np.mean(aucs)), 3),
          " (регрессия 0.614, самодельные признаки 0.56)")

    proc = ClapProcessor.from_pretrained(NAME)
    model = ClapModel.from_pretrained(NAME); model.eval()
    inp = proc(text=СЛОВА, return_tensors="pt", padding=True)
    with torch.no_grad():
        T = model.get_text_features(**inp).numpy()
    T = T / np.linalg.norm(T, axis=1, keepdims=True)
    gm = good.mean(0); gm /= np.linalg.norm(gm)
    bm = bad.mean(0); bm /= np.linalg.norm(bm)
    diff = [(СЛОВА[i], float(T[i] @ gm - T[i] @ bm), float(T[i] @ gm)) for i in range(len(СЛОВА))]
    diff.sort(key=lambda x: -x[1])
    print("\nближе к принятому, чем к отвергнутому:")
    for w, d, s in diff[:8]:
        print(f"  +{d:+.4f}  {w}")
    print("\nдальше всего от принятого:")
    for w, d, s in diff[-6:]:
        print(f"  {d:+.4f}  {w}")


if __name__ == "__main__":
    main()
