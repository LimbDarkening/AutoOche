import pyaudio
import numpy as np
from typing import List
from scipy.io.wavfile import write
from speech_recognition import AudioFile, Recognizer
import os
import sounddevice as sd


def capture_audio(frames_per_buffer=1024, channels=1, rate=44100, seconds=5):
    """Capture audio from the default microphone input and return it as a numpy array

    :param frames_per_buffer: number of frames to capture at once
    :param channels: number of channels to capture
    :param rate: sample rate of the audio
    :param seconds: length of the audio to capture
    :return: numpy array of the captured audio
    """
    print("Listening...")
    audio = pyaudio.PyAudio()
    stream = audio.open(
        format=pyaudio.paInt16,
        channels=channels,
        rate=rate,
        input=True,
        frames_per_buffer=frames_per_buffer,
    )
    frames = []
    for i in range(0, int(rate / frames_per_buffer * seconds)):
        data = stream.read(frames_per_buffer)
        frames.append(np.frombuffer(data, dtype=np.int16))
    stream.stop_stream()
    stream.close()
    audio.terminate()
    print("Done!")
    return np.concatenate(frames)


def analyze_audio(audio_data: np.ndarray, keywords: List[str]) -> bool:
    """
    Analyzes the audio data for the presence of specific keywords.

    :param audio_data: The audio data to analyze, as a numpy array.
    :param keywords: A list of strings representing the keywords to search for.
    :return: True if any of the keywords are found in the audio data, False otherwise.
    """
    # Write the audio data to a temporary WAV file
    temp_file = "temp_audio.wav"
    write(temp_file, 44100, audio_data.astype(np.int16))

    # Create a recognizer and load the audio file
    recognizer = Recognizer()
    audio = AudioFile(temp_file)

    # Perform speech recognition
    try:
        transcription = recognizer.recognize_sphinx(audio)
    except Exception:
        transcription = ""

    # Clean up the temporary file
    os.remove(temp_file)

    # Check if any of the keywords are present in the transcription
    for keyword in keywords:
        if keyword in transcription:
            return True

    return False


def analyze_text(audio_data: np.ndarray) -> str:
    """
    Analyzes the audio data for speech and returns the transcribed text.

    :param audio_data: The audio data to analyze, as a numpy array.
    :return: The transcribed text, or an empty string if no speech is detected.
    """
    # Write the audio data to a temporary WAV file
    temp_file = "temp_audio.wav"
    write(temp_file, 44100, audio_data.astype(np.int16))

    # Create a recognizer and load the audio file
    recognizer = Recognizer()
    audio = AudioFile(temp_file)

    # Perform speech recognition
    try:
        transcription = recognizer.recognize_sphinx(audio)
    except Exception:
        transcription = ""

    # Clean up the temporary file
    os.remove(temp_file)

    return transcription


def test_microphone():
    """
    Test if the microphone is working by capturing audio data and playing it back.
    """
    audio_data = capture_audio()
    sd.play(audio_data, 44100)
    sd.wait()


if __name__ == "__main__":
    test_microphone()
    # audio_data = capture_audio()
    # keywords = ["one"]
    # has_keyword = analyze_text(audio_data)
    # print(has_keyword)
