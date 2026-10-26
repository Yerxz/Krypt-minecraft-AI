# Documentation/helper only. voice.js invokes Windows SAPI directly with a safely encoded command.
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SetOutputToDefaultAudioDevice()
$synth.Speak('KRYPT voice subsystem ready.')
$synth.Dispose()
