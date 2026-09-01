#!/usr/bin/env python3
"""Раздача отзвука плюс постоянное хранение избранного и истории.

Страница браузера не может писать в произвольную папку, а localStorage
привязан к origin и слетает при смене порта или профиля. Поэтому состояние
держим файлом: ~/Documents/otzvuk/state.json.
"""
import json
import os
import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

ROOT = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.expanduser("~/Documents/otzvuk")
STATE = os.path.join(STORE, "state.json")
RECS = os.path.join(STORE, "записи")
ПРЕСЕТЫ = os.path.join(STORE, "presets")
# Папка называлась по-русски, пока имена в проекте были кириллическими.
# Читаем обе — ни один сохранённый пресет потеряться не должен.
ПРЕСЕТЫ_СТАР = os.path.join(STORE, "пресеты")
PORT = 8781


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        # Кэш браузера подсовывал старую страницу после правок; с разнесением
        # на модули это стало бы хроническим — раздаём всё без кэша.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        # Путь приходит в процентной кодировке — без разбора обратно адрес
        # с непростыми именами не совпадёт ни с одним обработчиком.
        p = unquote(self.path.split("?")[0])
        if p == "/":
            # Корень ведёт на инструмент.
            self.send_response(302)
            self.send_header("Location", "/instrument.html")
            self.end_headers()
            return
        if p == "/presets":
            try:
                os.makedirs(ПРЕСЕТЫ, exist_ok=True)
                строки = []
                видели = set()
                for папка in (ПРЕСЕТЫ, ПРЕСЕТЫ_СТАР):
                    if not os.path.isdir(папка):
                        continue
                    for имя in sorted(os.listdir(папка)):
                        if not имя.endswith(".json") or имя in видели:
                            continue
                        видели.add(имя)
                        with open(os.path.join(папка, имя), encoding="utf-8") as f:
                            д = json.load(f)
                        д["file"] = имя
                        строки.append(д)
                return self._json(200, {"presets": строки})
            except (ValueError, OSError) as e:
                return self._json(500, {"error": str(e)})
                return self._json(200, {"rows": rows})
            except FileNotFoundError:
                return self._json(200, {"rows": []})
            except (ValueError, OSError) as e:
                return self._json(500, {"error": str(e)})
        if p != "/state":
            return super().do_GET()
        try:
            with open(STATE, encoding="utf-8") as f:
                self._json(200, json.load(f))
        except FileNotFoundError:
            self._json(200, {})
        except (json.JSONDecodeError, OSError) as e:
            # честная ошибка вместо тихого нуля: иначе испорченный файл
            # выглядел бы как «избранное пропало»
            self._json(500, {"error": str(e)})

    def do_PUT(self):
        if self.path.split("?")[0] != "/state":
            return self._json(404, {"error": "нет такой ручки"})
        try:
            n = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(n) or b"{}")
            os.makedirs(STORE, exist_ok=True)
            tmp = STATE + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=1)
            os.replace(tmp, STATE)   # запись атомарна: не потеряем при обрыве
            self._json(200, {"ok": True, "path": STATE})
        except (ValueError, OSError) as e:
            self._json(500, {"error": str(e)})

    def do_DELETE(self):
        # УДАЛЁННЫЙ ПРЕСЕТ НЕ СТИРАЕТСЯ, А ПЕРЕЕЗЖАЕТ. Промах мышью не должен
        # стоить сохранённого звука: файл уходит в `presets/удалённые/`, и
        # вернуть его — вопрос перетаскивания обратно.
        p = unquote(self.path.split("?")[0])
        if p.startswith("/presets/"):
            имя = os.path.basename(p[len("/presets/"):])
            if not имя.endswith(".json"):
                return self._json(400, {"error": "не пресет"})
            try:
                for папка in (ПРЕСЕТЫ, ПРЕСЕТЫ_СТАР):
                    путь = os.path.join(папка, имя)
                    if not os.path.isfile(путь):
                        continue
                    корзина = os.path.join(ПРЕСЕТЫ, "удалённые")
                    os.makedirs(корзина, exist_ok=True)
                    куда = os.path.join(корзина, имя)
                    k = 2
                    while os.path.exists(куда):
                        куда = os.path.join(корзина, f"{имя[:-5]} ({k}).json")
                        k += 1
                    os.replace(путь, куда)
                    return self._json(200, {"ok": True, "file": имя})
                return self._json(404, {"error": "нет такого"})
            except OSError as e:
                return self._json(500, {"error": str(e)})
        return self._json(404, {"error": "нет такого"})

    def do_POST(self):
        if unquote(self.path.split("?")[0]) == "/presets":
            try:
                n = int(self.headers.get("Content-Length") or 0)
                д = json.loads(self.rfile.read(n) or b"{}")
                os.makedirs(ПРЕСЕТЫ, exist_ok=True)
                имя = "".join(c for c in str(д.get("name") or д.get("имя") or "preset")
                              if c not in '/\\:*?"<>|')[:60]
                путь = os.path.join(ПРЕСЕТЫ, имя + ".json")
                # Один и тот же снимок дважды не пишем, а вот разные под
                # одним именем разводим номером — терять пресеты нельзя.
                k = 2
                while os.path.exists(путь):
                    путь = os.path.join(ПРЕСЕТЫ, f"{имя} ({k}).json")
                    k += 1
                with open(путь, "w", encoding="utf-8") as f:
                    json.dump(д, f, ensure_ascii=False, indent=1)
                return self._json(200, {"ok": True, "file": os.path.basename(путь)})
            except (ValueError, OSError) as e:
                return self._json(500, {"error": str(e)})

        # ЗАМЕР. Прибор шлёт сюда кадры описания звука вместе с ИМЕНЕМ
        # ЯВЛЕНИЯ, которое человек в нём услышал, — «захлёбывание», «ровное
        # качание», «треск от удара».
        #
        # Не приговор «нравится», а название: приговор говорит о человеке, а
        # имя явления — о приборе. Из повторов одного имени выводится эталон:
        # подпись явления в величинах, по которой его дальше опознаёт счёт.
        #
        # Копим по одному файлу на пометку: терять их нельзя, а склеивать в
        # один общий значит рано или поздно его затереть.
        if self.path.split("?")[0] == "/zamer":
            try:
                n = int(self.headers.get("Content-Length") or 0)
                д = json.loads(self.rfile.read(n) or b"{}")
                папка = os.path.join(STORE, "замеры")
                os.makedirs(папка, exist_ok=True)
                имя = str(д.get("явление") or д.get("метка") or "без-имени")
                метка = "".join(c for c in имя if c.isalnum() or c in "-_ ")[:40].strip()
                метка = метка.replace(" ", "-") or "без-имени"
                номер = len([f for f in os.listdir(папка) if f.endswith(".json")]) + 1
                путь = os.path.join(папка, f"{номер:04d}-{метка}.json")
                with open(путь, "w", encoding="utf-8") as f:
                    json.dump(д, f, ensure_ascii=False)
                return self._json(200, {"ok": True, "file": os.path.basename(путь)})
            except (ValueError, OSError) as e:
                return self._json(500, {"error": str(e)})

        # БЫСТРЫЙ ЩУП. Полсекунды состояния схемы поотсчётно. Отсчёты
        # приходят восьмибитной строкой в base64 и ложатся отдельным
        # двоичным файлом: полтора мегабайта чисел в JSON раздулись бы в
        # двадцать и потеряли бы точность на печати.
        if self.path.split("?")[0] == "/bystro":
            try:
                import base64
                n = int(self.headers.get("Content-Length") or 0)
                д = json.loads(self.rfile.read(n) or b"{}")
                папка = os.path.join(STORE, "щуп")
                os.makedirs(папка, exist_ok=True)
                имя = "".join(c for c in str(д.get("имя") or "щуп")
                              if c.isalnum() or c in "-_ ")[:40].strip().replace(" ", "-")
                номер = len([f for f in os.listdir(папка) if f.endswith(".json")]) + 1
                осн = os.path.join(папка, f"{номер:04d}-{имя or 'щуп'}")
                with open(осн + ".f32", "wb") as f:
                    f.write(base64.b64decode(д.pop("dannye", "")))
                with open(осн + ".json", "w", encoding="utf-8") as f:
                    json.dump(д, f, ensure_ascii=False)
                return self._json(200, {"ok": True, "file": os.path.basename(осн)})
            except (ValueError, OSError) as e:
                return self._json(500, {"error": str(e)})

                return self._json(200, {"ok": True, "queued": key})
            except (ValueError, OSError) as e:
                return self._json(500, {"error": str(e)})
                return self._json(200, {"ok": True})
            except (ValueError, OSError) as e:
                return self._json(500, {"error": str(e)})
                return self._json(200, {"ok": True})
            except (ValueError, OSError) as e:
                return self._json(500, {"error": str(e)})
        if self.path.split("?")[0] != "/rec":
            return self._json(404, {"error": "нет такой ручки"})
        try:
            n = int(self.headers.get("Content-Length", 0))
            if n <= 44:
                return self._json(400, {"error": "пустая запись"})
            # Имя приходит в процентной кодировке: в заголовке HTTP можно
            # только латиницу, а имена у записей человеческие.
            name = unquote(self.headers.get("X-Name") or "otzvuk.wav")
            name = os.path.basename(name).replace("/", "_")
            os.makedirs(RECS, exist_ok=True)
            path = os.path.join(RECS, name)
            # читаем потоком: запись может быть в сотни мегабайт
            left, tmp = n, path + ".part"
            with open(tmp, "wb") as f:
                while left > 0:
                    chunk = self.rfile.read(min(1 << 20, left))
                    if not chunk:
                        break
                    f.write(chunk)
                    left -= len(chunk)
            os.replace(tmp, path)
            self._json(200, {"ok": True, "path": path, "bytes": n - left})
        except (ValueError, OSError) as e:
            self._json(500, {"error": str(e)})

    def log_message(self, *a):
        pass


# Свои окна умеют все хромоподобные: `--app=` открывает окно без вкладок и
# адресной строки. Имя бинарника внутри .app совпадает с именем приложения у
# всех шести, потому и таблица такая короткая.
БРАУЗЕРЫ = ["Comet", "Google Chrome", "Chromium", "Yandex",
            "Brave Browser", "Microsoft Edge"]


def okno():
    """Открыть прибор своим окном, а не вкладкой.

    Вкладка стоила трёх вещей разом: Tab и его сочетания забирал себе
    браузер, случайное закрытие резало звук щелчком, а рядом всегда сидели
    чужие вкладки. У окна ничего этого нет.

    Бинарник зовём НАПРЯМУЮ, а не через `open`: у хромоподобных свой
    одиночка — если браузер уже запущен, он примет команду и откроет окно в
    ТОМ ЖЕ профиле. Это важно не только для скорости: захват звука вкладки
    видит только вкладки своего профиля.
    """
    адрес = f"http://127.0.0.1:{PORT}/instrument.html"
    for имя in БРАУЗЕРЫ:
        путь = f"/Applications/{имя}.app/Contents/MacOS/{имя}"
        if os.path.exists(путь):
            subprocess.Popen([путь, f"--app={адрес}"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print(f"окно: {имя}")
            return
    print("окно: хромоподобного браузера не нашлось, открой вкладкой")


if __name__ == "__main__":
    os.makedirs(RECS, exist_ok=True)
    сервер = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"отзвук: http://127.0.0.1:{PORT}  ·  записи: {RECS}")
    # Окно открываем ПОСЛЕ того, как порт занят, иначе браузер успевает
    # ткнуться в пустоту и показать свою страницу об ошибке.
    if "--okno" in sys.argv:
        okno()
    сервер.serve_forever()
