#!/usr/bin/env python3
"""ИСТОК — порождение ФРАГМЕНТОВ по описанию, с отбором по CLAP.

Главное решение (yala, 2026-08-19): нужен не непрерывный поток, где каждая
секунда своя, а поток СЭМПЛОВ — повторяющиеся фрагменты. Это снимает вопрос
скорости целиком: генерация уходит в фон и работает впрок, а звучит всегда
готовое. Заодно возвращает узнаваемость, которой не хватало живому потоку.

Фрагмент обрезается до целого числа тактов по заданному темпу — иначе петля
хромает на стыке, и никакая обработка этого не спасёт.

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


def подрежь(x, sr, bpm, тактов=2):
    """Обрезаем до целого числа тактов и сшиваем стык коротким затуханием.

    Точка старта ищется по наибольшему нарастанию энергии в первой доле:
    петля, начатая с середины затухания, слышна как спотыкание.
    """
    длина_такта = 60.0 / bpm * 4
    n = int(длина_такта * тактов * sr)
    if len(x) < n + int(sr * .2):
        return x
    доля = int(60.0 / bpm * sr)
    окно = min(доля, len(x) - n)
    e = np.abs(x[:okно_безопасно(окно, len(x))])
    старт = 0
    if окно > 32:
        шаг = max(1, окно // 256)
        лучший, лучшая = 0, -1
        for i in range(0, окно - шаг, шаг):
            рост = float(np.mean(e[i:i + шаг]) - np.mean(e[max(0, i - шаг):i] or [0]))
            if рост > лучшая:
                лучшая, лучший = рост, i
        старт = лучший
    y = x[старт:старт + n].copy()
    склейка = int(sr * .006)                      # шесть миллисекунд на стык
    if len(y) > склейка * 2:
        окончание = y[-склейка:] * np.linspace(1, 0, склейка)
        начало = y[:склейка] * np.linspace(0, 1, склейка)
        y[:склейка] = начало + окончание
        y[-склейка:] *= np.linspace(1, 0, склейка)
    return y


def okно_безопасно(окно, длина):
    return max(1, min(окно, длина))


_кэш = None


def породи(текст, сколько=3, секунд=8.0, bpm=None, тактов=2):
    global _кэш
    if _кэш is None:
        dev = "mps" if torch.backends.mps.is_available() else "cpu"
        _кэш = (*грузи_musicgen(dev), *грузи_clap())
    mg_proc, mg, clap_proc, clap = _кэш
    dev = next(mg.parameters()).device
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
    if bpm:
        лучший = подрежь(лучший, 32000, bpm, тактов)
    имя = f"{int(time.time()*1000)}.wav"
    путь = os.path.join(ИСТОК, имя)
    sf.write(путь, лучший / (np.abs(лучший).max() + 1e-9) * .9, 32000)
    r = {"файл": имя, "близость": round(лучшая, 4), "секунд_генерации": round(ген, 1),
         "вариантов": сколько, "запрос": текст, "длина": round(len(лучший) / 32000, 2)}
    if bpm:
        r["bpm"] = bpm; r["тактов"] = тактов
    with open(os.path.join(STORE, "исток.jsonl"), "a", encoding="utf-8") as f:
        f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return r


def служи():
    """Режим службы: ждёт заказ в файле, кладёт готовое в папку истока."""
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    print("гружу MusicGen и CLAP…", flush=True)
    globals()["_кэш"] = (*грузи_musicgen(dev), *грузи_clap())
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
                               int(d.get("вариантов", 3)), float(d.get("секунд", 8)),
                               d.get("bpm"), int(d.get("тактов", 2)))
                    print("готово:", r, flush=True)
        except Exception as e:
            print("сбой заказа:", e, flush=True)
        time.sleep(.5)


НАБОР = [
    # Список составлен не с потолка: это то, что CLAP нашёл ближе всего к
    # принятому yala на 134 парах — тёмное, низкое, тональное, чистое.
    "deep dark sub bass loop, tonal, clean, hypnotic",
    "dark ambient drone loop, warm, slow movement",
    "muffled underwater texture, deep, soft",
    "punchy drum machine loop, dark, minimal",
    "techno rumble loop, deep, hypnotic",
    "smooth hip hop sample loop, dusty, mellow",
    "clean sine bass, tonal, minimal, deep",
    "warm analog pad loop, dark, slow",
]


def копи(сколько=16, bpm=140, тактов=2, секунд=9.0):
    """Набиваем библиотеку впрок. Скорость перестала быть помехой: играет
    всегда готовое, а генерация идёт фоном сколько угодно долго."""
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    print("гружу модели…", flush=True)
    mg_proc, mg = грузи_musicgen(dev)
    clap_proc, clap = грузи_clap()
    os.makedirs(ИСТОК, exist_ok=True)
    globals()["_кэш"] = (mg_proc, mg, clap_proc, clap)
    for i in range(сколько):
        текст = НАБОР[i % len(НАБОР)]
        r = породи(текст, 2, секунд, bpm, тактов)
        print(f"{i+1}/{сколько}", r["файл"], r["близость"], r["запрос"], flush=True)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "служи":
        служи()
    elif len(sys.argv) > 1 and sys.argv[1] == "копи":
        копи(int(sys.argv[2]) if len(sys.argv) > 2 else 16,
             int(sys.argv[3]) if len(sys.argv) > 3 else 140)
    else:
        текст = sys.argv[1] if len(sys.argv) > 1 else "deep dark sub bass, tonal, clean, slow movement"
        n = int(sys.argv[2]) if len(sys.argv) > 2 else 3
        print(породи(текст, n))
