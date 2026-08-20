#!/usr/bin/env python3
"""Честная проверка: выучивается ли вкус на CLAP-эмбеддингах.

Считаем то же, что считали на самодельных признаках, чтобы сравнение было
честным: пятикратная перекрёстная проверка, AUC по пареным сравнениям.
AUC 0.5 — монетка; на своих 18 признаках получилось 0.56.
"""
import json
import os
import sys

import numpy as np

STORE = os.path.expanduser("~/Documents/otzvuk")


SCRATCH = "/private/tmp/claude-502/-Users-yala/15a2ff36-fbf8-4b1e-9532-7ad769179edd/scratchpad/vkus.json"


def load():
    # Журнал берём через сервер: файл создан другим процессом и напрямую
    # недоступен из-за защиты папки «Документы» в macOS.
    p = os.path.join(STORE, "вкус.jsonl")
    try:
        log = [json.loads(x) for x in open(p, encoding="utf-8") if x.strip()]
    except OSError:
        log = json.load(open(SCRATCH, encoding="utf-8"))["rows"]
    emb = {}
    p = os.path.join(STORE, "эмбеддинги.jsonl")
    if os.path.exists(p):
        for x in open(p, encoding="utf-8"):
            if x.strip():
                r = json.loads(x)
                emb[r["key"]] = np.array(r["v"], dtype=np.float32)
    return log, emb


def pairs(log, emb):
    out = []
    for r in log:
        ka = f'{r["profile"]}_{r["seedA"] & 0xffffffff}'
        kb = f'{r["profile"]}_{r["seedB"] & 0xffffffff}'
        if ka not in emb or kb not in emb:
            continue
        out.append((emb[ka], emb[kb], r["win"]))
    return out


def marks(ps):
    X, y = [], []
    for a, b, w in ps:
        if w == "a":
            X += [a, b]; y += [1, 0]
        elif w == "b":
            X += [b, a]; y += [1, 0]
        else:
            X += [a, b]; y += [0, 0]
    return np.array(X), np.array(y, dtype=np.float32)


def fit(X, y, epochs=400, lr=.5, reg=.02):
    n, d = X.shape
    w = np.zeros(d, dtype=np.float32); b = 0.0
    pos = y.sum(); neg = n - pos
    cw = np.where(y > .5, neg / max(pos, 1), 1.0).astype(np.float32)  # редкий класс весомее
    for _ in range(epochs):
        z = X @ w + b
        p = 1 / (1 + np.exp(-z))
        g = (y - p) * cw
        w += lr * (X.T @ g / n - reg * w)
        b += lr * g.mean()
    return w, b


def auc(pos, neg):
    if not len(pos) or not len(neg):
        return None
    wins = sum((p > n) + .5 * (p == n) for p in pos for n in neg)
    return wins / (len(pos) * len(neg))


def main():
    log, emb = load()
    ps = pairs(log, emb)
    print(f"пар с эмбеддингами: {len(ps)} из {len(log)}")
    if len(ps) < 40:
        print("мало данных, жду выгрузку"); return
    folds, aucs = 5, []
    for f in range(folds):
        te = [p for i, p in enumerate(ps) if i % folds == f]
        tr = [p for i, p in enumerate(ps) if i % folds != f]
        Xtr, ytr = marks(tr)
        w, b = fit(Xtr, ytr)
        pos, neg = [], []
        for a, bb, win in te:
            sa, sb = float(a @ w + b), float(bb @ w + b)
            if win == "a": pos.append(sa); neg.append(sb)
            elif win == "b": pos.append(sb); neg.append(sa)
            else: neg += [sa, sb]
        v = auc(pos, neg)
        if v is not None:
            aucs.append(v)
    print("AUC по фолдам:", [round(v, 3) for v in aucs])
    print("AUC средний:", round(float(np.mean(aucs)), 3), " (самодельные признаки давали 0.56)")
    # что модель считает годным: сравним с текстовыми описаниями отдельно
    X, y = marks(ps)
    w, b = fit(X, y)
    np.save(os.path.join(STORE, "вкус_вектор.npy"), np.concatenate([w, [b]]))
    print("вектор вкуса сохранён, годных примеров:", int(y.sum()), "из", len(y))


if __name__ == "__main__":
    main()
