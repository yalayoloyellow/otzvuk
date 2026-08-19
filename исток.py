#!/usr/bin/env python3
"""ИСТОК — порождение материала по описанию, с отбором по CLAP.

Почему так, а не обучением на кликах: 134 клика дали модель уровня 0.6 —
надёжного отбора из неё не выйдет ни при каком методе, 33 положительных
примера на 512 измерений мало. Зато CLAP zero-shot согласуется с живыми
слушателями на 71.9%, и работает в обе стороны: можно СКАЗАТЬ словами,
чего хотим, и померить попадание. Поэтому руль — текст.

Генератор порождает несколько вариантов, CLAP выбирает самый близкий к
описанию, результат кладётся в папку истока — движок берёт его как вход,
наравне с микрофоном и файлом.

Запуск:  python3 исток.py "deep dark sub bass, tonal, clean" 3
"""
import json
import os
import sys
import time

import numpy as np
import soundfile as sf
import torch

STORE = os.path.expanduser("~/Documents/otzvuk")
ИСТОК = os.path.join(STORE, "исток")
ЗАКАЗ = os.path.join(STORE, "заказ.json")
SR_OUT = 44100


def грузи_clap():
    from transformers import ClapModel, ClapProcessor
    name = "laion/clap-htsat-unfused"
    return ClapProcessor.from_pretrained(name), ClapModel.from_pretrained(name).eval()


def грузи_musicgen(dev):
    from transformers import AutoProcessor, MusicgenForConditionalGeneration
    name = "facebook/musicgen-small"
    proc = AutoProcessor.from_pretrained(name)
    model = MusicgenForConditionalGeneration.from_pretrained(name).to(dev).eval()
    return proc, model


def в48(x, sr):
    """CLAP обучен на 48 кГц и отказывается работать с другим — пересчитываем."""
    if sr == 48000:
        return x
    n = int(len(x) * 48000 / sr)
    return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)


def близость(clap_proc, clap, audio, sr, текст):
    audio, sr = в48(audio, sr), 48000
    a = clap_proc(audio=audio, sampling_rate=sr, return_tensors="pt")
    t = clap_proc(text=[текст], return_tensors="pt", padding=True)
    with torch.no_grad():
        va = clap.get_audio_features(**a)[0]
        vt = clap.get_text_features(**t)[0]
    va = va / va.norm(); vt = vt / vt.norm()
    return float(va @ vt)


def породи(текст, сколько=3, секунд=8.0):
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    mg_proc, mg = грузи_musicgen(dev)
    clap_proc, clap = грузи_clap()
    os.makedirs(ИСТОК, exist_ok=True)
    токенов = int(секунд * 50)          # MusicGen: пятьдесят токенов на секунду
    inp = mg_proc(text=[текст] * сколько, padding=True, return_tensors="pt").to(dev)
    t0 = time.time()
    with torch.no_grad():
        out = mg.generate(**inp, max_new_tokens=токенов, do_sample=True, guidance_scale=3.0)
    ген = time.time() - t0
    лучший, лучшая = None, -9
    for i in range(out.shape[0]):
        x = out[i, 0].cpu().numpy().astype(np.float32)
        s = близость(clap_proc, clap, x, 32000, текст)
        if s > лучшая:
            лучшая, лучший = s, x
    имя = f"{int(time.time())}.wav"
    путь = os.path.join(ИСТОК, имя)
    sf.write(путь, лучший / (np.abs(лучший).max() + 1e-9) * .9, 32000)
    return {"файл": имя, "близость": round(лучшая, 4),
            "секунд_генерации": round(ген, 1), "вариантов": сколько, "запрос": текст}


def служи():
    """Режим службы: ждёт заказ в файле, кладёт готовое в папку истока."""
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    print("гружу MusicGen и CLAP…", flush=True)
    mg_proc, mg = грузи_musicgen(dev)
    clap_proc, clap = грузи_clap()
    os.makedirs(ИСТОК, exist_ok=True)
    print("исток готов, устройство:", dev, flush=True)
    прошлый = None
    while True:
        try:
            if os.path.exists(ЗАКАЗ):
                d = json.load(open(ЗАКАЗ, encoding="utf-8"))
                if d.get("t") != прошлый:
                    прошлый = d.get("t")
                    r = породи(d.get("текст", "dark tonal texture"),
                               int(d.get("вариантов", 3)), float(d.get("секунд", 8)))
                    with open(os.path.join(STORE, "исток.jsonl"), "a", encoding="utf-8") as f:
                        f.write(json.dumps(r, ensure_ascii=False) + "\n")
                    print("готово:", r, flush=True)
        except Exception as e:
            print("сбой заказа:", e, flush=True)
        time.sleep(.5)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "служи":
        служи()
    else:
        текст = sys.argv[1] if len(sys.argv) > 1 else "deep dark sub bass, tonal, clean, slow movement"
        n = int(sys.argv[2]) if len(sys.argv) > 2 else 3
        print(породи(текст, n))
