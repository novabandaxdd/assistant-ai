# JARVIS Voice Files

Place your custom TTS audio files here.

The app uses the **Web Speech API** (browser's built-in TTS) with Brazilian Portuguese (pt-BR) voices.
If you have a custom audio recording of the Brazilian JARVIS dubber, you can integrate it as follows:

## Custom Voice Integration

To use a custom Brazilian voice audio file instead of the browser TTS:

1. Place your `.mp3` or `.wav` file here as `jarvis-voice.mp3`
2. In `src/hooks/useSpeech.ts`, replace the `speak()` function body to use `new Audio('/voice/jarvis-voice.mp3').play()` 
   for specific phrases, or integrate a TTS API that returns the audio stream.

## Current TTS Priority (Web Speech API)

The voice picker tries these Brazilian voices in order:
1. `Google português do Brasil` (Chrome)
2. `Google Portuguese (Brazil)` (Chrome)
3. `Microsoft Daniel` (Windows)
4. `Microsoft Francisca` (Windows)
5. `Luciana` / `Felipe` (macOS)
6. Any `pt-BR` voice available
7. Any Portuguese voice
8. Fallback: any available voice

Params: `pitch: 0.72`, `rate: 0.85`, `lang: pt-BR`
