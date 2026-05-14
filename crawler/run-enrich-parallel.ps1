<#
.SYNOPSIS
  Run enrich.py (Claude) and enrich-gpt.py (Azure OpenAI) in parallel from
  opposite ends of the catalog. They cross-check each other's output every
  30s, so duplicate work is minimized. Final step merges into enrichment.json.

.DESCRIPTION
  Spawns two background Python processes:
    - enrich.py iterates forward (a → z → 0 → 9) and writes enrichment.json
    - enrich-gpt.py iterates reverse (9 → 0 → z → a) and writes enrichment-gpt.json
  Each reads the other's output as a cross-check so they skip entries the
  other has already done. They naturally meet in the middle.

  After both finish, calls merge-enrichment.py to produce a unified
  enrichment.json (Claude file is overwritten with the merge).

  Each process writes its own .log file in crawler/. The script tees their
  output to the console with a [claude] or [gpt] prefix so you can watch
  both streams live.

.PARAMETER ClaudeOnly
  Skip the Azure side (run only enrich.py).

.PARAMETER GptOnly
  Skip the Claude side (run only enrich-gpt.py).

.PARAMETER NoMerge
  Don't run the merge step at the end. Useful for testing or if you want
  to inspect the two outputs separately.

.EXAMPLE
  pwsh -File crawler/run-enrich-parallel.ps1
    # Full parallel run + merge.

.EXAMPLE
  pwsh -File crawler/run-enrich-parallel.ps1 -NoMerge
    # Run both but leave files separate for inspection.
#>

param(
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
  param(
    [string]$Label,
    [string]$Cmd,
    [string]$LogFile
  )
  # Use Start-Process with redirection so output is captured to file.
  # Returns the Process object so we can wait on it.
  $args = @{
    FilePath = "powershell"
    ArgumentList = @("-NoProfile", "-Command", "& { $Cmd 2>&1 | Tee-Object -FilePath '$LogFile' -Encoding utf8 | ForEach-Object { Write-Host '[$Label] '`$_ } }")
    PassThru = $true
    NoNewWindow = $true
  }
  return Start-Process @args
}

$procs = @()

if (-not $GptOnly) {
  Write-Host "starting Claude enricher (forward, writes enrichment.json)" -ForegroundColor Cyan
  Remove-Item $claudeLog -ErrorAction SilentlyContinue
  $cmd = "python crawler/enrich.py --cross-check enrichment-gpt.json --on-quota-limit exit"
  $procs += @{ Label = 'claude'; Proc = (Start-Worker -Label 'claude' -Cmd $cmd -LogFile $claudeLog) }
}

if (-not $ClaudeOnly) {
  Write-Host "starting GPT enricher (reverse, writes enrichment-gpt.json)" -ForegroundColor Cyan
  Remove-Item $gptLog -ErrorAction SilentlyContinue
  $cmd = "python crawler/enrich-gpt.py --reverse --cross-check enrichment.json"
  $procs += @{ Label = 'gpt'; Proc = (Start-Worker -Label 'gpt' -Cmd $cmd -LogFile $gptLog) }
}

if ($procs.Count -eq 0) {
  Write-Host "nothing to run (both -ClaudeOnly and -GptOnly set?)" -ForegroundColor Yellow
  exit 1
}

Write-Host "waiting for $($procs.Count) worker(s) to finish (Ctrl+C cancels)…" -ForegroundColor Cyan
foreach ($p in $procs) {
  $p.Proc.WaitForExit()
  Write-Host "[$($p.Label)] exited (rc=$($p.Proc.ExitCode))" -ForegroundColor Cyan
}

if (-not $NoMerge -and -not $ClaudeOnly -and -not $GptOnly) {
  Write-Host "merging enrichment files…" -ForegroundColor Cyan
  python crawler/merge-enrichment.py
}

Write-Host "done." -ForegroundColor Green
