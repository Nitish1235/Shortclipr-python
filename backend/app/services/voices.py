import asyncio
import time
from typing import Any

import httpx

from ..core.config import Settings


# Current UnrealSpeech v8/Kokoro voices published by its Studio. The catalog
# remains available even if an optional provider catalog endpoint is unavailable.
FALLBACK_VOICES = [
    {"id":"af_bella","name":"Hannah","language":"English (US)","description":"Reserved, natural American female"},
    {"id":"af_nicole","name":"Kaitlyn","language":"English (US)","description":"Casual, whisper-like American female"},
    {"id":"af_sarah","name":"Lauren","language":"English (US)","description":"Confident educator-style American female"},
    {"id":"af_sky","name":"Sierra","language":"English (US)","description":"Composed American female"},
    {"id":"am_adam","name":"Noah","language":"English (US)","description":"Confident American male"},
    {"id":"am_michael","name":"Daniel","language":"English (US)","description":"Confident American male"},
    {"id":"bf_emma","name":"Chloe","language":"English (UK)","description":"British female"},
    {"id":"bf_isabella","name":"Amelia","language":"English (UK)","description":"Calm British female"},
    {"id":"bm_george","name":"Edward","language":"English (UK)","description":"Mature British male"},
    {"id":"bm_lewis","name":"Oliver","language":"English (UK)","description":"Confident British male"},
    {"id":"ff_siwis","name":"Élodie","language":"French","description":"Young French female"},
    {"id":"hf_alpha","name":"Ananya","language":"Hindi","description":"Young Hindi female"},
    {"id":"hf_beta","name":"Priya","language":"Hindi","description":"Young Hindi female"},
    {"id":"hm_omega","name":"Arjun","language":"Hindi","description":"Young Hindi male"},
    {"id":"jf_alpha","name":"Sakura","language":"Japanese","description":"Young Japanese female"},
    {"id":"jf_gongitsune","name":"Hana","language":"Japanese","description":"Young Japanese female"},
    {"id":"jm_kumo","name":"Haruto","language":"Japanese","description":"Young Japanese male"},
    {"id":"ef_dora","name":"Lucía","language":"Spanish","description":"Young Spanish female"},
    {"id":"em_alex","name":"Mateo","language":"Spanish","description":"Young Spanish male"},
    {"id":"if_sara","name":"Giulia","language":"Italian","description":"Young Italian female"},
    {"id":"im_nicola","name":"Luca","language":"Italian","description":"Young Italian male"},
    {"id":"zf_xiaobei","name":"Mei","language":"Chinese","description":"Young Chinese female"},
    {"id":"zf_xiaoni","name":"Lian","language":"Chinese","description":"Young Chinese female"},
    {"id":"zm_yunjian","name":"Wei","language":"Chinese","description":"Young Chinese male"},
    {"id":"pf_dora","name":"Camila","language":"Portuguese","description":"Young Portuguese female"},
    {"id":"pm_alex","name":"Thiago","language":"Portuguese","description":"Young Portuguese male"},
]
KOKORO_IDS = {voice["id"] for voice in FALLBACK_VOICES}
LEGACY_IDS = {"scarlett", "dan", "liv", "will", "amy"}


class VoiceCatalogue:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._voices: list[dict[str, Any]] = FALLBACK_VOICES
        self._expires_at = 0.0

    async def list(self) -> list[dict[str, Any]]:
        endpoint = self.settings.UNREALSPEECH_VOICE_CATALOG_URL.rstrip("/")
        if not endpoint or not self.settings.UNREALSPEECH_API_KEY or time.monotonic() < self._expires_at:
            return self._voices
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.get(endpoint, headers={"Authorization": f"Bearer {self.settings.UNREALSPEECH_API_KEY}"})
                response.raise_for_status()
                payload = response.json()
            raw = payload.get("voices", payload if isinstance(payload, list) else [])
            provider_voices = [{"id":str(item.get("id") or item.get("voice_id")),"name":item.get("name") or item.get("display_name") or "Voice","language":item.get("language") or item.get("locale") or "Unknown","description":item.get("description"),"preview_url":item.get("preview_url")} for item in raw]
            if provider_voices:
                self._voices = provider_voices
        except (httpx.HTTPError, ValueError, TypeError):
            # Keep the documented catalog usable if an optional discovery URL changes.
            self._voices = FALLBACK_VOICES
        self._expires_at = time.monotonic() + 3600
        return self._voices


class UnrealSpeech:
    def __init__(self, settings: Settings):
        self.settings = settings

    async def synthesize(self, text: str, voice_id: str) -> tuple[bytes, bytes]:
        if not self.settings.UNREALSPEECH_API_KEY:
            raise RuntimeError("UNREALSPEECH_API_KEY is not configured")
        headers = {"Authorization": f"Bearer {self.settings.UNREALSPEECH_API_KEY}"}
        base = self.settings.UNREALSPEECH_API_BASE.rstrip("/")
        async with httpx.AsyncClient(timeout=90, follow_redirects=True) as client:
            if voice_id in KOKORO_IDS:
                if len(text) > 1000:
                    task_response = await client.post(f"{base}/synthesisTasks", headers=headers, json={"Text":text,"VoiceId":voice_id,"Bitrate":"192k","Speed":"0","Pitch":"1","TimestampType":"word"})
                    task_response.raise_for_status()
                    task = task_response.json().get("SynthesisTask", task_response.json())
                    task_id = task.get("TaskId") or task.get("task_id")
                    if not task_id:
                        raise RuntimeError("UnrealSpeech did not return a synthesis task ID")
                    for _ in range(45):
                        await asyncio.sleep(2)
                        status_response = await client.get(f"{base}/synthesisTasks/{task_id}", headers=headers)
                        status_response.raise_for_status()
                        status_payload = status_response.json().get("SynthesisTask", status_response.json())
                        state = str(status_payload.get("TaskStatus") or status_payload.get("task_status") or "").lower()
                        if state == "completed":
                            audio_url = status_payload.get("OutputUri") or status_payload.get("outputUri")
                            timestamps_url = status_payload.get("TimestampsUri") or status_payload.get("timestampsUri")
                            if not audio_url: raise RuntimeError("UnrealSpeech completed without an audio URL")
                            audio = await client.get(audio_url); audio.raise_for_status()
                            if timestamps_url:
                                stamps = await client.get(timestamps_url); stamps.raise_for_status()
                                return audio.content, stamps.content
                            return audio.content, b"[]"
                        if state in {"failed", "cancelled"}:
                            raise RuntimeError(f"UnrealSpeech synthesis task {state}")
                    raise RuntimeError("UnrealSpeech synthesis task timed out")
                response = await client.post(f"{base}/stream", headers=headers, json={"Text":text[:1000],"VoiceId":voice_id,"Bitrate":"192k","Speed":"0","Pitch":"1","Codec":"libmp3lame"})
                response.raise_for_status()
                return response.content, b"[]"
            normalized = voice_id.title() if voice_id.lower() in LEGACY_IDS else voice_id
            response = await client.post(f"{base}/speech", headers=headers, json={"Text":text[:3000],"VoiceId":normalized,"Bitrate":"192k","Speed":"0","Pitch":"1","TimestampType":"word"})
            response.raise_for_status()
            result = response.json()
            audio_url = result.get("OutputUri") or result.get("outputUri")
            timestamps_url = result.get("TimestampsUri") or result.get("timestampsUri")
            if not audio_url:
                raise RuntimeError("UnrealSpeech did not return an audio URL")
            audio_response = await client.get(audio_url); audio_response.raise_for_status()
            if timestamps_url:
                timestamps_response = await client.get(timestamps_url); timestamps_response.raise_for_status()
                return audio_response.content, timestamps_response.content
            return audio_response.content, b"[]"
