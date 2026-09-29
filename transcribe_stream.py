"""Low-latency local transcription worker. stdin/stdout use newline-delimited JSON."""
import argparse
import base64
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
MODEL = Path(os.environ.get("TRANSCRIPTION_MODEL_DIR", ROOT / "models" / "tiny.en"))


def emit(kind, **payload):
    print(json.dumps({"type": kind, **payload}), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--download", action="store_true")
    args = parser.parse_args()
    if args.download:
        from faster_whisper.utils import download_model
        download_model("tiny.en", output_dir=str(MODEL))
        emit("status", text="Fast transcription model ready")
        return

    os.environ["HF_HUB_OFFLINE"] = "1"
    if not (MODEL / "model.bin").exists():
        raise RuntimeError("Transcription model missing. Run npm run setup:transcription first.")
    import numpy as np
    from faster_whisper import WhisperModel

    emit("status", text="Loading transcription model…")
    model = WhisperModel(str(MODEL), device="cpu", compute_type="int8",
                         local_files_only=True, cpu_threads=min(6, os.cpu_count() or 2))
    emit("ready", text="Listening")
    for line in sys.stdin:
        try:
            message = json.loads(line)
            if message.get("type") == "stop":
                break
            samples = np.frombuffer(base64.b64decode(message["audio"]), dtype=np.float32)
            if samples.size < 4000:
                continue
            # A cheap local energy gate avoids the separate Silero/ONNX runtime
            # and keeps silent chunks out of Whisper's inference queue.
            if float(np.sqrt(np.mean(np.square(samples)))) < 0.006:
                continue
            segments, _ = model.transcribe(samples, language="en", beam_size=1,
                                            vad_filter=False, condition_on_previous_text=False)
            text = " ".join(s.text.strip() for s in segments if s.no_speech_prob < 0.55).strip()
            if text:
                emit("transcript", speaker=message.get("speaker", "computer"), text=text,
                     capturedAt=message.get("capturedAt"))
        except Exception as error:
            emit("warning", text=str(error))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit("error", text=str(error))
        sys.exit(1)
