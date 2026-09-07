"""Copy default Windows playback into VB-CABLE without capturing a physical mic."""
import json
import math
import sys
import threading


def emit(kind, text):
    print(json.dumps({"type": kind, "text": text}), flush=True)


def main():
    import numpy as np
    import pyaudiowpatch as pa
    from scipy.signal import resample_poly

    stopped = threading.Event()

    def watch_parent():
        for line in sys.stdin:
            if line.strip() == 'stop':
                break
        stopped.set()

    with pa.PyAudio() as audio:
        wasapi = audio.get_host_api_info_by_type(pa.paWASAPI)['index']
        cables = [audio.get_device_info_by_index(i) for i in range(audio.get_device_count())]
        cable = next((d for d in cables if d['hostApi'] == wasapi
                      and d['maxOutputChannels'] > 0 and 'CABLE Input' in d['name']), None)
        if not cable:
            raise RuntimeError('VB-CABLE missing. Install its driver and restart Windows.')
        source = audio.get_default_wasapi_loopback()
        if 'CABLE' in source['name']:
            raise RuntimeError('Set Windows playback to your speakers/headphones, not CABLE Input.')
        default_mic = audio.get_default_input_device_info()
        if 'CABLE Output' not in default_mic['name']:
            raise RuntimeError('Set CABLE Output as the Windows default recording device, then restart the app.')
        if '--check' in sys.argv:
            emit('ready', f"{source['name']} -> CABLE Output")
            return

        threading.Thread(target=watch_parent, daemon=True).start()
        source_rate = int(source['defaultSampleRate'])
        target_rate = int(cable['defaultSampleRate'])
        source_channels = int(source['maxInputChannels'])
        target_channels = min(2, int(cable['maxOutputChannels']))
        divisor = math.gcd(source_rate, target_rate)
        with audio.open(format=pa.paFloat32, channels=source_channels, rate=source_rate,
                        input=True, input_device_index=source['index'], frames_per_buffer=1024) as capture:
            with audio.open(format=pa.paFloat32, channels=target_channels, rate=target_rate,
                            output=True, output_device_index=cable['index'], frames_per_buffer=1024) as output:
                emit('ready', 'System audio ready')
                while not stopped.is_set():
                    data = capture.read(1024, exception_on_overflow=True)
                    samples = np.frombuffer(data, dtype=np.float32).reshape(-1, source_channels)
                    if source_channels != target_channels:
                        samples = np.repeat(samples.mean(axis=1, keepdims=True), target_channels, axis=1)
                    if source_rate != target_rate:
                        samples = resample_poly(samples, target_rate // divisor, source_rate // divisor, axis=0)
                    output.write(samples.astype(np.float32).tobytes())


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        emit('error', str(error))
        sys.exit(1)
