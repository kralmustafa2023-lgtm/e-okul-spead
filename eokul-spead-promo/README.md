# e-Okul Spead promotional video

This is a separate, editable vertical promo-video project. It does not alter the website, Firebase/auth configuration, or deployment files.

## Output

- **MP4:** out/eokul-spead-promo-vertical.mp4 — 1080×1920, 30 fps, about 55 seconds, H.264 video and AAC narration.
- **Captions:** out/eokul-spead-promo-vertical.srt — synchronized Turkish captions.
- **Cover:** out/eokul-spead-cover.png — social cover frame.

## Source

- make_scenes.py builds the eight vector-style product scenes from local Python/Pillow drawing primitives.
- narration.json contains the Turkish voiceover and concise burned-in captions.
- render.ps1 uses the installed Windows Microsoft Tolga Turkish speech voice and FFmpeg to render the MP4.
- assets/scenes/ and assets/captions/ are generated from the source files.
- The supplied reference video was inspected for pacing only. Its footage, Arabic narration, sound, graphics, and scene layouts are not used in the output.

## Render again

From PowerShell in this directory:

~~~powershell
.\render.ps1
~~~

Requirements on this computer: Python 3.13 with Pillow, FFmpeg/ffprobe, and the Windows Microsoft Tolga (tr-TR) voice. The render does not call an external TTS service or use licensed third-party music. The narration is generated locally.

## Content notes

All score examples are fictional. The transfer-table scene is labeled as a representative mockup and does not imitate the official e-Okul/MEB interface. The video does not use the source page's variable metrics, testimonials, security/KVKK claims, student records, login fields, or official-approval marks.
