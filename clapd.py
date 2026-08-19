#!/usr/bin/env python3
"""Демон эмбеддингов: следит за папкой обмена и считает CLAP для каждого WAV.

Зачем отдельный процесс: torch грузится десятки секунд, а веб-сервер должен
подниматься мгновенно. Обмен через файлы — самый простой честный способ,
переживающий перезапуск любой из сторон.

Запуск:  python3 clapd.py
"""
import json
import os
import time

import numpy as np
import soundfile as sf
import torch
from transformers import ClapModel, ClapProcessor

STORE = os.path.expanduser("~/Documents/otzvuk")
INBOX = os.path.join(STORE, "обмен")
EMB = os.path.join(STORE, "эмбеддинги.jsonl")
NAME = "laion/clap-htsat-unfused"
SR = 48000


def main():
    os.makedirs(INBOX, exist_ok=True)
    print("гружу CLAP…", flush=True)
    proc = ClapProcessor.from_pretrained(NAME)
    model = ClapModel.from_pretrained(NAME)
    model.eval()
    print("готов, слушаю", INBOX, flush=True)
    done = set()
    if os.path.exists(EMB):
        with open(EMB, encoding="utf-8") as f:
            done = {json.loads(x)["key"] for x in f if x.strip()}
    while True:
        files = [f for f in os.listdir(INBOX) if f.endswith(".wav")]
        if not files:
            time.sleep(.4)
            continue
        for name in sorted(files):
            key = name[:-4]
            path = os.path.join(INBOX, name)
            try:
                x, sr = sf.read(path, dtype="float32", always_2d=True)
                x = x.mean(axis=1)
                if key not in done:
                    inp = proc(audios=x, sampling_rate=sr, return_tensors="pt")
                    with torch.no_grad():
                        v = model.get_audio_features(**inp)[0]
                    v = (v / v.norm()).tolist()          # единичная длина: сравниваем углы
                    with open(EMB, "a", encoding="utf-8") as f:
                        f.write(json.dumps({"key": key, "v": [round(q, 5) for q in v]}) + "\n")
                    done.add(key)
                os.remove(path)
            except Exception as e:                        # файл мог быть недописан
                print("пропуск", key, e, flush=True)
                time.sleep(.2)


if __name__ == "__main__":
    main()
