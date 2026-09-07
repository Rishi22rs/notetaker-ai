$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$samplePath = Join-Path ([System.IO.Path]::GetTempPath()) ('caption-test-' + [guid]::NewGuid() + '.wav')
$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $voice.SetOutputToWaveFile($samplePath)
    $voice.Speak('This is a local caption test. The meeting starts tomorrow morning at nine.')
    $voice.SetOutputToNull()
    $result = & "$PSScriptRoot\.venv\Scripts\python.exe" "$PSScriptRoot\transcribe.py" --file $samplePath
    if ($LASTEXITCODE -ne 0) { throw "Recognition failed: $result" }
    $events = $result | ForEach-Object { $_ | ConvertFrom-Json }
    $text = ($events | Where-Object type -eq 'transcript').text
    if ($text -notmatch 'meeting' -or $text -notmatch 'tomorrow') { throw "Unexpected transcript: $text" }
    Write-Output "Local speech recognition passed: $text"
} finally {
    $voice.Dispose()
    if (Test-Path -LiteralPath $samplePath) { Remove-Item -LiteralPath $samplePath }
}
