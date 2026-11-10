#!/usr/bin/python3
"""
Engawa と Mac の Spotify アプリのあいだの橋（Chrome のネイティブメッセージングのホスト）。

拡張は Mac のアプリに直接話しかけられないので、ブラウザがこのスクリプトを起動し、
標準入出力で JSON をやりとりする（先頭 4 バイトが長さ）。ここでは AppleScript で
Spotify アプリに聞くだけで、ネットワークには一切出ない。Spotify が起動していなければ起こさない。

受け取る: {"n": 番号, "cmd": "state" | "play" | "pause" | "next" | "previous"}
返す:     {"n": 番号, "ok": true, "state": "playing" | "paused" | "stopped" | "not-running", ...曲の情報}
          {"n": 番号, "ok": false, "error": "..."}
"""
import json
import struct
import subprocess
import sys

SEP = "\x1f"

STATE_SCRIPT = """
if application "Spotify" is not running then return "not-running"
tell application "Spotify"
  set playerNow to player state as string
  if playerNow is "stopped" then return "stopped"
  set sep to (ASCII character 31)
  set trk to current track
  set artLink to ""
  try
    set artLink to artwork url of trk
    if artLink is missing value then set artLink to ""
  end try
  set trackLink to ""
  try
    set trackLink to spotify url of trk
    if trackLink is missing value then set trackLink to ""
  end try
  return playerNow & sep & (id of trk) & sep & (name of trk) & sep & (artist of trk) & sep & artLink & sep & (duration of trk) & sep & (player position) & sep & trackLink
end tell
"""

COMMANDS = {
    "play": "play",
    "pause": "pause",
    "next": "next track",
    "previous": "previous track",
}


def osascript(script):
    r = subprocess.run(["/usr/bin/osascript", "-e", script], capture_output=True, text=True, timeout=5)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or "osascript failed")
    return r.stdout.rstrip("\n")


def number(text):
    # 地域の設定によっては小数点がカンマで返る
    return float(text.replace(",", "."))


def state():
    out = osascript(STATE_SCRIPT)
    if out in ("not-running", "stopped"):
        return {"state": out}
    st, track_id, title, artist, art, duration, position, url = out.split(SEP)
    return {
        "state": st,
        "id": track_id,
        "title": title,
        "artist": artist,
        "artUrl": art,
        "durationMs": number(duration),
        "positionS": number(position),
        "url": url,
    }


def handle(msg):
    cmd = msg.get("cmd")
    if cmd == "state":
        return state()
    if cmd in COMMANDS:
        # 起動していないアプリを、操作のために起こしたりはしない
        osascript('if application "Spotify" is running then tell application "Spotify" to ' + COMMANDS[cmd])
        return {}
    raise RuntimeError("unknown command")


def read():
    head = sys.stdin.buffer.read(4)
    if len(head) < 4:
        return None
    (size,) = struct.unpack("<I", head)
    return json.loads(sys.stdin.buffer.read(size).decode("utf-8"))


def send(obj):
    data = json.dumps(obj).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)) + data)
    sys.stdout.buffer.flush()


def main():
    while True:
        msg = read()
        if msg is None:
            return
        reply = {"n": msg.get("n")}
        try:
            reply.update(handle(msg))
            reply["ok"] = True
        except Exception as e:  # 失敗しても橋は落とさず、理由を返す
            reply["ok"] = False
            reply["error"] = str(e)
        send(reply)


if __name__ == "__main__":
    main()
