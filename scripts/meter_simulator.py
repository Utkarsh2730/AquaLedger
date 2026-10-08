#!/usr/bin/env python3
"""
AquaLedger smart-meter simulator (standard library only, no pip install needed).

Posts one reading per tick to the meter-ingest Lambda Function URL. Press Enter to open or
close the "tap": an open tap sends ~12 L/min, far above a flat's normal rate, so the backend
raises a live leak alert and emails the committee.

    python scripts/meter_simulator.py --url <meterIngestUrl> --society <societyId> \
        --token <device token> --flat C-301

The URL is in amplify_outputs.json (custom.meterIngestUrl); the society id and token are on
the app's Live meters and Settings pages.
"""
import argparse
import json
import random
import sys
import threading
import time
import urllib.error
import urllib.request

tap_open = False


def toggle_on_enter():
    global tap_open
    for _ in sys.stdin:
        tap_open = not tap_open
        print(f"\n>>> tap {'OPEN (leak!)' if tap_open else 'closed'}\n", flush=True)


def send(url, token, payload):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json", "x-device-token": token},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read() or b"{}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--url", required=True)
    p.add_argument("--society", required=True)
    p.add_argument("--token", required=True)
    p.add_argument("--flat", default="C-301")
    p.add_argument("--interval", type=float, default=3.0, help="seconds between readings")
    args = p.parse_args()

    threading.Thread(target=toggle_on_enter, daemon=True).start()
    print(f"Metering flat {args.flat}. Press Enter to open/close the tap. Ctrl+C to stop.")
    while True:
        if tap_open:
            litres = round(11 + random.random() * 2, 2)
        else:
            litres = 0.0 if random.random() < 0.6 else round(random.random() * 1.2, 2)
        try:
            out = send(args.url, args.token, {"societyId": args.society, "flat": args.flat, "litres": litres, "periodMinutes": 1})
            status = f"ALERT: {out['alert']}" if out.get("alert") and out["alert"] != "already-open" else "ok"
            print(f"{time.strftime('%H:%M:%S')}  {litres:5.2f} L/min  {status}", flush=True)
        except urllib.error.HTTPError as e:
            print(f"HTTP {e.code}: {e.read().decode()}", flush=True)
        except Exception as e:  # keep going through Wi-Fi blips on stage
            print(f"error: {e}", flush=True)
        time.sleep(args.interval)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
