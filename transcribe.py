"""Local Windows playback captions. Stdout carries JSON events only."""
import argparse
import json
import math
import os
from pathlib import Path
import queue
import sys
import threading

ROOT = Path(__file__).resolve().parent
MODEL = ROOT / "models" / "base"


def emit(kind, **payload):
    print(json.dumps({"type": kind, **payload}), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--file")
    args = parser.parse_args()
    if args.download:
        from faster_whisper.utils import download_model
        download_model("base", output_dir=str(MODEL))
        emit("status", text="Local model ready")
        return

    os.environ["HF_HUB_OFFLINE"] = "1"
    if not (MODEL / "model.bin").exists():
        raise RuntimeError("Model missing. Run npm run setup:captions first.")
    import numpy as np
    import pyaudiowpatch as pa
    from scipy.signal import resample_poly
    from faster_whisper import WhisperModel

    emit("status", text="Loading local model...")
    model = WhisperModel(str(MODEL), device="cpu", compute_type="int8",
                         local_files_only=True, cpu_threads=min(4, os.cpu_count() or 2))
    if args.file:
        segments, _ = model.transcribe(args.file, beam_size=1, vad_filter=True)
        emit("transcript", text=" ".join(s.text.strip() for s in segments))
        return

    with pa.PyAudio() as audio:
        device = audio.get_default_wasapi_loopback()
        rate = int(device["defaultSampleRate"])
        channels = int(device["maxInputChannels"])
        if args.check:
            # Exercise the inference engine without recording user audio.
            segments, _ = model.transcribe(np.zeros(16000, dtype=np.float32),
                                            language="en", vad_filter=True)
            list(segments)
            emit("status", text="Model and loopback device ready", device=device["name"])
            return

        packets = queue.Queue(maxsize=100)
        stop = threading.Event()
        overflow = threading.Event()

        def watch_parent():
            for line in sys.stdin:
                if line.strip() == "stop":
                    break
            stop.set()

        threading.Thread(target=watch_parent, daemon=True).start()

        def callback(data, frame_count, time_info, status):
            if stop.is_set():
                return (None, pa.paComplete)
            if status:
                overflow.set()
            try:
                packets.put_nowait(data)
            except queue.Full:
                overflow.set()
            return (None, pa.paContinue)

        with audio.open(format=pa.paFloat32, channels=channels, rate=rate,
                        input=True, input_device_index=device["index"],
                        frames_per_buffer=max(1, rate // 10),
                        stream_callback=callback) as stream:
            emit("status", text="Listening", device=device["name"])
            chunks = []
            count = 0
            while not stop.is_set():
                if overflow.is_set():
                    raise RuntimeError("Audio processing fell behind. Pause and resume captions to retry.")
                try:
                    packet = packets.get(timeout=0.25)
                except queue.Empty:
                    if not stream.is_active():
                        raise RuntimeError("Audio device stopped. Resume captions after checking your output device.")
                    continue
                mono = np.frombuffer(packet, dtype=np.float32).reshape(-1, channels).mean(axis=1)
                chunks.append(mono)
                count += len(mono)
                if count < rate * 4:
                    continue
                samples = np.concatenate(chunks)
                chunks, count = [], 0
                divisor = math.gcd(rate, 16000)
                samples = resample_poly(samples, 16000 // divisor, rate // divisor).astype(np.float32)
                segments, _ = model.transcribe(samples, beam_size=1, vad_filter=True,
                                                condition_on_previous_text=False)
                text = " ".join(s.text.strip() for s in segments if s.no_speech_prob < 0.6)
                if text and not stop.is_set():
                    emit("transcript", text=text)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit("error", text=str(error))
        sys.exit(1)
