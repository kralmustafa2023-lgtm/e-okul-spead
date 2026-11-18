$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$python = "C:/Users/pcx/AppData/Local/Programs/Python/Python313/python.exe"
$ffmpegCandidates = @(
    $env:FFMPEG,
    (Get-Command ffmpeg.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1),
    "C:/Users/pcx/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffmpeg.exe"
) | Where-Object { $_ -and (Test-Path $_) }
$ffprobeCandidates = @(
    $env:FFPROBE,
    (Get-Command ffprobe.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1),
    "C:/Users/pcx/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffprobe.exe"
) | Where-Object { $_ -and (Test-Path $_) }
$ffmpeg = $ffmpegCandidates | Select-Object -First 1
$ffprobe = $ffprobeCandidates | Select-Object -First 1
if (-not (Test-Path $python)) { throw "Python 3.13 was not found at $python" }
if (-not $ffmpeg -or -not $ffprobe) { throw "FFmpeg and ffprobe are required. Set FFMPEG and FFPROBE to their executable paths." }

Push-Location $root
try {
    New-Item -ItemType Directory -Force -Path "assets/scenes", "assets/captions", "audio", "out", "work" | Out-Null
    & $python "make_scenes.py"
    if ($LASTEXITCODE -ne 0) { throw "Scene generation failed." }

    Add-Type -AssemblyName System.Speech
    $voice = "Microsoft Tolga"
    $narration = Get-Content "narration.json" -Raw -Encoding UTF8 | ConvertFrom-Json
    $voiceDurations = [System.Collections.Generic.List[double]]::new()
    $invariant = [Globalization.CultureInfo]::InvariantCulture
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)

    for ($i = 0; $i -lt $narration.Count; $i++) {
        $number = $i + 1
        $audioPath = "audio/voice-$('{0:D2}' -f $number).wav"
        $captionPath = "assets/captions/scene-$('{0:D2}' -f $number).txt"
        [IO.File]::WriteAllText((Join-Path $root $captionPath), [string]$narration[$i].caption, $utf8NoBom)

        $synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
        try {
            $synth.SelectVoice($voice)
            $synth.Rate = 1
            $synth.Volume = 95
            $synth.SetOutputToWaveFile((Join-Path $root $audioPath))
            $synth.Speak([string]$narration[$i].text)
        }
        finally {
            $synth.Dispose()
        }

        $durationText = & $ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $audioPath
        if ($LASTEXITCODE -ne 0) { throw "Could not read duration for $audioPath" }
        $duration = [double]::Parse(([string]$durationText).Trim(), $invariant)
        $voiceDurations.Add($duration)
        Write-Host ("Voice {0:D2}: {1:N2}s ({2})" -f $number, $duration, $voice)
    }

    $sceneCount = $narration.Count
    $crossfade = 0.45
    $lead = 0.25
    $targetDuration = 55.0
    $speechTotal = ($voiceDurations | Measure-Object -Sum).Sum
    $holdTotal = $targetDuration + ($sceneCount - 1) * $crossfade - $speechTotal - $sceneCount * $lead
    $ctaHold = 2.40
    $sceneHold = ($holdTotal - $ctaHold) / ($sceneCount - 1)
    if ($sceneHold -lt 0.55) {
        $sceneHold = 0.55
        $ctaHold = [Math]::Max(2.0, $holdTotal - ($sceneCount - 1) * $sceneHold)
    }
    if ($sceneHold -gt 2.4) {
        $ctaHold += ($sceneHold - 2.4) * ($sceneCount - 1)
        $sceneHold = 2.4
    }

    $sceneDurations = [System.Collections.Generic.List[double]]::new()
    for ($i = 0; $i -lt $sceneCount; $i++) {
        $hold = if ($i -eq $sceneCount - 1) { $ctaHold } else { $sceneHold }
        $sceneDurations.Add($voiceDurations[$i] + $lead + $hold)
    }
    $finalDuration = (($sceneDurations | Measure-Object -Sum).Sum) - ($sceneCount - 1) * $crossfade
    Write-Host ("Expected runtime: {0:N2}s; ending card hold: {1:N2}s" -f $finalDuration, $ctaHold)
    if ($finalDuration -lt 52 -or $finalDuration -gt 58) {
        throw ("Runtime {0:N2}s is outside the 52–58s target; shorten or retime narration." -f $finalDuration)
    }

    function Format-SrtTime([double]$seconds) {
        $ms = [int][Math]::Round($seconds * 1000)
        $hours = [Math]::Floor($ms / 3600000); $ms %= 3600000
        $minutes = [Math]::Floor($ms / 60000); $ms %= 60000
        $wholeSeconds = [Math]::Floor($ms / 1000); $ms %= 1000
        return ("{0:00}:{1:00}:{2:00},{3:000}" -f $hours, $minutes, $wholeSeconds, $ms)
    }
    $srt = [System.Collections.Generic.List[string]]::new()
    $timelineStart = 0.0
    for ($i = 0; $i -lt $sceneCount; $i++) {
        $number = $i + 1
        $capStart = $timelineStart + $lead + 0.10
        $capEnd = $timelineStart + $lead + $voiceDurations[$i] - 0.12
        $srt.Add([string]$number)
        $srt.Add("$(Format-SrtTime $capStart) --> $(Format-SrtTime $capEnd)")
        $srt.Add([string]$narration[$i].caption)
        $srt.Add("")
        $timelineStart += $sceneDurations[$i] - $crossfade
    }
    [IO.File]::WriteAllText((Join-Path $root "out/eokul-spead-promo-vertical.srt"), ($srt -join [Environment]::NewLine), $utf8NoBom)
    Copy-Item "assets/scenes/scene-08.png" "out/eokul-spead-cover.png" -Force

    $filters = [System.Collections.Generic.List[string]]::new()
    $inputArgs = [System.Collections.Generic.List[string]]::new()
    for ($i = 0; $i -lt $sceneCount; $i++) {
        $number = $i + 1
        $imagePath = "assets/scenes/scene-$('{0:D2}' -f $number).png"
        $inputArgs.Add("-loop"); $inputArgs.Add("1")
        $inputArgs.Add("-framerate"); $inputArgs.Add("30")
        $inputArgs.Add("-t"); $inputArgs.Add($sceneDurations[$i].ToString("0.000", $invariant))
        $inputArgs.Add("-i"); $inputArgs.Add($imagePath)
    }
    for ($i = 0; $i -lt $sceneCount; $i++) {
        $inputArgs.Add("-i")
        $inputArgs.Add("audio/voice-$('{0:D2}' -f ($i + 1)).wav")
    }

    for ($i = 0; $i -lt $sceneCount; $i++) {
        $number = $i + 1
        $frames = [Math]::Max(1, [Math]::Floor($sceneDurations[$i] * 30))
        $step = (0.025 / $frames).ToString("0.00000000", $invariant)
        if ($i % 2 -eq 0) { $zoom = "min(1.0+$step*on,1.025)" }
        else { $zoom = "max(1.025-$step*on,1.0)" }
        $fontPath = "C\:/Windows/Fonts/segoeui.ttf"
        $captionFile = "assets/captions/scene-$('{0:D2}' -f $number).txt"
        $captionEnd = [Math]::Max(0.5, $voiceDurations[$i] - 0.04).ToString("0.000", $invariant)
        $videoFilter = ("[{0}:v]zoompan=z='{1}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,drawtext=fontfile='{2}':textfile='{3}':fontsize=34:fontcolor=0x13213b:box=1:boxcolor=white@0.92:boxborderw=20:line_spacing=10:x=(w-text_w)/2:y=h-text_h-200:enable='between(t,0.34,{4})',setsar=1,format=yuv420p[v{5}]" -f $i, $zoom, $fontPath, $captionFile, $captionEnd, $number)
        $filters.Add($videoFilter)

        $audioIndex = $sceneCount + $i
        $audioDuration = $sceneDurations[$i]
        if ($i -lt $sceneCount - 1) { $audioDuration -= $crossfade }
        $audioDurationText = $audioDuration.ToString("0.000", $invariant)
        $audioFilter = ("[{0}:a]adelay=250|250,apad=pad_dur=3,atrim=duration={1},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a{2}]" -f $audioIndex, $audioDurationText, $number)
        $filters.Add($audioFilter)
    }

    $previousLabel = "v1"
    $offset = $sceneDurations[0] - $crossfade
    for ($i = 1; $i -lt $sceneCount; $i++) {
        $number = $i + 1
        $label = "vx$number"
        $offsetText = $offset.ToString("0.000", $invariant)
        $crossfadeText = $crossfade.ToString("0.000", $invariant)
        $filters.Add(("[" + $previousLabel + "][v" + $number + "]xfade=transition=fade:duration=" + $crossfadeText + ":offset=" + $offsetText + "[" + $label + "]"))
        $previousLabel = $label
        if ($i -lt $sceneCount - 1) { $offset += $sceneDurations[$i] - $crossfade }
    }
    $audioLabels = (1..$sceneCount | ForEach-Object { "[a$_]" }) -join ""
    $fadeStart = [Math]::Max(0, $finalDuration - 1.0).ToString("0.000", $invariant)
    $concatFilter = $audioLabels + "concat=n=" + $sceneCount + ":v=0:a=1,highpass=f=70,lowpass=f=15000,acompressor=threshold=-20dB:ratio=2:attack=20:release=220,loudnorm=I=-16:TP=-1.5:LRA=9,afade=t=out:st=" + $fadeStart + ":d=1.0[aout]"
    $filters.Add($concatFilter)

    $output = "out/eokul-spead-promo-vertical.mp4"
    $ffArgs = [System.Collections.Generic.List[string]]::new()
    $ffArgs.Add("-hide_banner"); $ffArgs.Add("-y")
    foreach ($arg in $inputArgs) { $ffArgs.Add($arg) }
    $ffArgs.Add("-filter_complex"); $ffArgs.Add(($filters -join ";"))
    $ffArgs.Add("-map"); $ffArgs.Add("[" + $previousLabel + "]")
    $ffArgs.Add("-map"); $ffArgs.Add("[aout]")
    $ffArgs.Add("-t"); $ffArgs.Add($finalDuration.ToString("0.000", $invariant))
    $ffArgs.Add("-r"); $ffArgs.Add("30")
    $ffArgs.Add("-c:v"); $ffArgs.Add("libx264")
    $ffArgs.Add("-preset"); $ffArgs.Add("veryfast")
    $ffArgs.Add("-crf"); $ffArgs.Add("19")
    $ffArgs.Add("-pix_fmt"); $ffArgs.Add("yuv420p")
    $ffArgs.Add("-c:a"); $ffArgs.Add("aac")
    $ffArgs.Add("-b:a"); $ffArgs.Add("192k")
    $ffArgs.Add("-ar"); $ffArgs.Add("48000")
    $ffArgs.Add("-movflags"); $ffArgs.Add("+faststart")
    $ffArgs.Add($output)
    & $ffmpeg @ffArgs
    if ($LASTEXITCODE -ne 0) { throw "FFmpeg render failed with exit code $LASTEXITCODE." }

    $probe = & $ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate -of json $output | ConvertFrom-Json
    $videoStream = $probe.streams | Where-Object { $_.codec_name -eq "h264" } | Select-Object -First 1
    $audioStream = $probe.streams | Where-Object { $_.codec_name -eq "aac" } | Select-Object -First 1
    if (-not $videoStream -or $videoStream.width -ne 1080 -or $videoStream.height -ne 1920 -or $videoStream.r_frame_rate -ne "30/1" -or -not $audioStream) {
        throw "Rendered output failed format verification."
    }
    $actualDuration = [double]::Parse($probe.format.duration, $invariant)
    Write-Host ("Verified: {0}x{1}, {2} fps, {3:N2}s, H.264 + AAC" -f $videoStream.width, $videoStream.height, $videoStream.r_frame_rate, $actualDuration)
    Write-Host "Output: $root/out/eokul-spead-promo-vertical.mp4"
    Write-Host "Captions: $root/out/eokul-spead-promo-vertical.srt"
    Write-Host "Cover: $root/out/eokul-spead-cover.png"
}
finally {
    Pop-Location
}
