// Sarah Eve — German, warm, the brief's default voice for ECHO.
export const DEFAULT_VOICE_ID = "tnSpp4vdxKPjI9w0GnoV";
export const DEFAULT_MODEL_ID = "eleven_flash_v2_5";

export async function synthesizeSpeech({
  text,
  voiceId = DEFAULT_VOICE_ID,
  modelId = DEFAULT_MODEL_ID,
}: {
  text: string;
  voiceId?: string;
  modelId?: string;
}): Promise<ArrayBuffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY missing");
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 200)}`);
  }

  return await res.arrayBuffer();
}
