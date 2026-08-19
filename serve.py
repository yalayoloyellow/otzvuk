#!/usr/bin/env python3
"""Раздача отзвука плюс постоянное хранение избранного и истории.

Страница браузера не может писать в произвольную папку, а localStorage
привязан к origin и слетает при смене порта или профиля. Поэтому состояние
держим файлом: ~/Documents/otzvuk/state.json.
"""
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.expanduser("~/Documents/otzvuk")
STATE = os.path.join(STORE, "state.json")
VKUS = os.path.join(STORE, "вкус.jsonl")
EMB = os.path.join(STORE, "эмбеддинги.jsonl")
RECS = os.path.join(STORE, "записи")
INBOX = os.path.join(STORE, "обмен")
ИСТОК = os.path.join(STORE, "исток")
ЗАКАЗ = os.path.join(STORE, "заказ.json")
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
        p = self.path.split("?")[0]
        if p == "/vkus":
            # журнал кликов: одна строка на пару, дописывается, не переписывается
            try:
                with open(VKUS, encoding="utf-8") as f:
                    rows = [json.loads(x) for x in f if x.strip()]
                return self._json(200, {"rows": rows})
            except FileNotFoundError:
                return self._json(200, {"rows": []})
            except (ValueError, OSError) as e:
                return self._json(500, {"error": str(e)})
        if p == "/исток/мета":
            # что известно о фрагментах: запрос, близость, темп, длина
            try:
                rows = []
                with open(os.path.join(STORE, "исток.jsonl"), encoding="utf-8") as f:
                    rows = [json.loads(x) for x in f if x.strip()]
                return self._json(200, {"rows": rows})
            except FileNotFoundError:
                return self._json(200, {"rows": []})
            except (ValueError, OSError) as e:
                return self._json(500, {"error": str(e)})
        if p == "/исток":
            # что уже породил генератор: список готовых файлов
            try:
                names = sorted(f for f in os.listdir(ИСТОК) if f.endswith(".wav"))
                return self._json(200, {"файлы": names})
            except FileNotFoundError:
                return self._json(200, {"файлы": []})
            except OSError as e:
                return self._json(500, {"error": str(e)})
        if p.startswith("/исток/"):
            from urllib.parse import unquote
            name = os.path.basename(unquote(p[len("/исток/"):]))
            path = os.path.join(ИСТОК, name)
            try:
                data = open(path, "rb").read()
                self.send_response(200)
                self.send_header("Content-Type", "audio/wav")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                return self.wfile.write(data)
            except OSError:
                return self._json(404, {"error": "нет такого"})
        if p == "/эмбеддинги":
            try:
                with open(EMB, encoding="utf-8") as f:
                    return self._json(200, {"rows": [json.loads(x) for x in f if x.strip()]})
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

    def do_POST(self):
        if self.path.split("?")[0] == "/clap":
            from urllib.parse import parse_qs, unquote
            # WAV из браузера → эмбеддинг CLAP. Модель живёт в отдельном
            # процессе (clapd.py) и общается через папку обмена: держать
            # торч внутри веб-сервера значит ждать его при каждом старте.
            try:
                n = int(self.headers.get("Content-Length", 0))
                q = parse_qs(self.path.split("?")[1] if "?" in self.path else "")
                # ключ едет в адресе, а не в заголовке: заголовки HTTP —
                # только латиница, а профили у нас по-русски
                key = unquote(q.get("key", ["нечто"])[0])
                key = key.replace("/", "_").replace("..", "_")
                data = self.rfile.read(n)
                os.makedirs(INBOX, exist_ok=True)
                tmp = os.path.join(INBOX, key + ".part")
                with open(tmp, "wb") as f:
                    f.write(data)
                os.replace(tmp, os.path.join(INBOX, key + ".wav"))
                return self._json(200, {"ok": True, "queued": key})
            except (ValueError, OSError) as e:
                return self._json(500, {"error": str(e)})
        if self.path.split("?")[0] == "/заказ":
            # заказ материала словами: демон истока подхватит и породит
            try:
                n = int(self.headers.get("Content-Length", 0))
                d = json.loads(self.rfile.read(n) or b"{}")
                os.makedirs(STORE, exist_ok=True)
                tmp = ЗАКАЗ + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(d, f, ensure_ascii=False)
                os.replace(tmp, ЗАКАЗ)
                return self._json(200, {"ok": True})
            except (ValueError, OSError) as e:
                return self._json(500, {"error": str(e)})
        if self.path.split("?")[0] == "/vkus":
            try:
                n = int(self.headers.get("Content-Length", 0))
                row = json.loads(self.rfile.read(n) or b"{}")
                os.makedirs(STORE, exist_ok=True)
                with open(VKUS, "a", encoding="utf-8") as f:
                    f.write(json.dumps(row, ensure_ascii=False) + "\n")
                return self._json(200, {"ok": True})
            except (ValueError, OSError) as e:
                return self._json(500, {"error": str(e)})
        if self.path.split("?")[0] != "/rec":
            return self._json(404, {"error": "нет такой ручки"})
        try:
            n = int(self.headers.get("Content-Length", 0))
            if n <= 44:
                return self._json(400, {"error": "пустая запись"})
            name = self.headers.get("X-Name") or "отзвук.wav"
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


if __name__ == "__main__":
    os.makedirs(RECS, exist_ok=True)
    os.makedirs(INBOX, exist_ok=True)
    os.makedirs(ИСТОК, exist_ok=True)
    print(f"отзвук: http://127.0.0.1:{PORT}  ·  записи: {RECS}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
