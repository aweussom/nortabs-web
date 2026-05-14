<#
.SYNOPSIS
  Run enrich.py (Claude) and enrich-gpt.py (Azure OpenAI) in parallel on
  DISJOINT letter sets. Each writes to its own enrichment/<letter>.json
  files; no race because they never touch the same letter. Final step
  runs merge-enrichment.py to refresh enrichment.json.

.DESCRIPTION
  Letter assignment (default):
    - Claude:  a..m              (13 letters, ~half the catalog by entry count)
    - GPT:     n..z æ ø å 0..9    (26 letters but several are empty/small)

  Override with -ClaudeLetters / -GptLetters if you want different splits.

  Each side runs as a background process:
    - Claude via run-enrich.ps1 (quota-aware wrapper, handles 5h resets)
    - GPT via direct python invocation (its own rate-limit logic)

  Output is teed to crawler/enrich-claude.log and enrich-gpt.log, prefixed
  with [claude] / [gpt] on the console for live monitoring.

.PARAMETER ClaudeLetters
  Letters for the Claude side. String of single-char codes. Default "abcdefghijklm".

.PARAMETER GptLetters
  Letters for the GPT side. Default "nopqrstuvwxyzæøå0123456789".

.PARAMETER ClaudeOnly
  Skip the Azure side.

.PARAMETER GptOnly
  Skip the Claude side.

.PARAMETER NoMerge
  Don't run merge-enrichment.py at the end.

.EXAMPLE
  pwsh -File crawler/run-enrich-parallel.ps1
    # Full parallel run with default split + merge.

.EXAMPLE
  pwsh -File crawler/run-enrich-parallel.ps1 -ClaudeLetters "abc" -GptLetters "xyz"
    # Quick targeted test.
#>

param(
  [string]$ClaudeLetters = "abcdefghijklm",
  [string]$GptLetters    = "nopqrstuvwxyzæøå0123456789",
  [switch]$ClaudeOnly,
  [switch]$GptOnly,
  [switch]$NoMerge
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = 'utf-8'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$claudeLog = "crawler/enrich-claude.log"
$gptLog    = "crawler/enrich-gpt.log"

function Start-Worker {
  param([string]$Label, [string]$Cmd, [string]$LogFile)
  $inner = "$Cmd 2>&1 | Tee-Object -FilePath '$LogFile' -Encoding utf8 | ForEach-Object { Write-Host '[$Label] '`$_ }"
  return Start-Process -FilePath powershell `
    -ArgumentList @("-NoProfile", "-Command", "& { $inner }") `
    -PassThru -NoNewWindow
}

$procs = @()

if (-not $GptOnly) {
  Write-Host "starting Claude on letters: $ClaudeLetters" -ForegroundColor Cyan
  Remove-Item $claudeLog -ErrorAction SilentlyContinue
  $cmd = "pwsh -NoProfile -File crawler/run-enrich.ps1 -Letters '$ClaudeLetters'"
  $procs += @{ Label = 'claude'; Proc = (Start-Worker -Label 'claude' -Cmd $cmd -LogFile $claudeLog) }
}

if (-not $ClaudeOnly) {
  Write-Host "starting GPT on letters: $GptLetters" -ForegroundColor Cyan
  Remove-Item $gptLog -ErrorAction SilentlyContinue
  # Comma-separate the letters for --letter
  $gptLetterCsv = ($GptLetters.ToCharArray() | ForEach-Object { [string]$_ }) -join ','
  $cmd = "python crawler/enrich-gpt.py --letter '$gptLetterCsv'"
  $procs += @{ Label = 'gpt'; Proc = (Start-Worker -Label 'gpt' -Cmd $cmd -LogFile $gptLog) }
}

if ($procs.Count -eq 0) {
  Write-Host "nothing to run" -ForegroundColor Yellow
  exit 1
}

Write-Host "waiting for $($procs.Count) worker(s) (Ctrl+C cancels)…" -ForegroundColor Cyan
foreach ($p in $procs) {
  $p.Proc.WaitForExit()
  Write-Host "[$($p.Label)] exited (rc=$($p.Proc.ExitCode))" -ForegroundColor Cyan
}

if (-not $NoMerge) {
  Write-Host "merging per-letter files → enrichment.json" -ForegroundColor Cyan
  python crawler/merge-enrichment.py
}

Write-Host "done." -ForegroundColor Green
