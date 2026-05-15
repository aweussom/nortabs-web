<#
.SYNOPSIS
  Daily scheduled trigger: pull latest catalog, run Claude enrichment,
  commit + push the resulting enrichment.json + enrichment/<letter>.json files.

.DESCRIPTION
  Run by Windows Task Scheduler ("nortabs-enrich-daily", 06:00 Oslo).
  Mirrors what Tommy does manually:
    1. git fetch + pull --ff-only (the nightly GitHub Action just pushed
       a fresh catalog.json + version.js; our local working tree must catch up).
    2. Refuse to run if the working tree is dirty — safer than guessing
       what to do with in-progress local edits.
    3. Invoke crawler/run-enrich.ps1, which:
         - Iterates letters, calling Claude via `claude -p --model sonnet`.
         - Sleeps through 5-hour Max-quota resets automatically.
         - Runs merge-enrichment.py at the end to refresh enrichment.json.
    4. Stage enrichment outputs. If anything was added/changed, commit and push.
       If not, exit cleanly (Mon-Sat incremental crawls often produce zero new
       entries to enrich).

  The Task Scheduler task is configured with:
    - StartWhenAvailable: catches up if the machine was asleep at 06:00.
    - MultipleInstances=IgnoreNew: skips today's run if yesterday's is still
      working through quota resets.

.PARAMETER RepoRoot
  Absolute path to the nortabs-web repo. Default: hardcoded for this machine.

.PARAMETER LogPath
  Where to tee progress. Default: crawler/scheduled-enrich.log (gitignored
  via the same crawler/*.log rule).

.EXAMPLE
  pwsh -File crawler/scheduled-enrich.ps1
    # Manual smoke-test before relying on the schedule.
#>

param(
  [string]$RepoRoot = "C:\devel\python\nortabs-web",
  [string]$LogPath  = "crawler/scheduled-enrich.log"
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = 'utf-8'

Set-Location $RepoRoot

$absLog = Join-Path $RepoRoot $LogPath
$logDir = Split-Path -Parent $absLog
if ($logDir -and -not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
}

function Write-RunLog {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Write-Host $line
  Add-Content -Path $absLog -Value $line -Encoding utf8
}

Write-RunLog "=== scheduled enrich run starting ==="

# --- Step 1: refuse only if OUR files are dirty ---
# Only the enrichment outputs would be silently clobbered by this run.
# Unrelated dirty files (README.md edits, in-progress search.js tweaks,
# etc.) are fine to ignore — git pull --ff-only won't touch them unless
# the incoming commits also modify them, and our git add is path-scoped.
$enrichStatus = git status --porcelain -- enrichment.json enrichment/ enrichment-gpt.json
if ($enrichStatus) {
  Write-RunLog "ABORT: enrichment files are dirty:"
  $enrichStatus -split "`r?`n" | ForEach-Object { if ($_) { Write-RunLog "  $_" } }
  Write-RunLog "Resolve manually (commit, stash, or revert), then re-run."
  exit 1
}

# Note unrelated dirty state for the log, but proceed.
$allStatus = git status --porcelain
if ($allStatus) {
  Write-RunLog "note: working tree has unrelated changes (ignored):"
  $allStatus -split "`r?`n" | ForEach-Object { if ($_) { Write-RunLog "  $_" } }
}

# --- Step 2: rebase pull (autostash unrelated dirty files) ---
# --rebase: handles the case where a previous run's push failed and we
#   have an enrichment commit still ahead of origin.
# --autostash: temporarily stashes uncommitted unrelated changes (e.g.,
#   Tommy's in-progress README.md edits) and re-applies them after.
Write-RunLog "git fetch + pull --rebase --autostash"
git fetch origin 2>&1 | ForEach-Object { Write-RunLog "  $_" }
git pull --rebase --autostash 2>&1 | ForEach-Object { Write-RunLog "  $_" }
if ($LASTEXITCODE -ne 0) {
  Write-RunLog "ABORT: pull --rebase failed (rc=$LASTEXITCODE). Aborting any in-progress rebase."
  git rebase --abort 2>$null
  exit 1
}

# --- Step 3: run Claude enrichment ---
# run-enrich.ps1 handles its own quota-aware retries and runs merge-enrichment.py at the end.
Write-RunLog "calling crawler/run-enrich.ps1"
pwsh -NoProfile -File crawler/run-enrich.ps1 2>&1 | ForEach-Object {
  Add-Content -Path $absLog -Value $_ -Encoding utf8
  Write-Host $_
}
$enrichRc = $LASTEXITCODE
Write-RunLog "run-enrich.ps1 exited rc=$enrichRc"

# --- Step 4: commit + push if there are enrichment changes ---
git add enrichment.json enrichment/ 2>&1 | ForEach-Object {
  if ($_) { Write-RunLog "  $_" }
}

$stagedRaw = git diff --cached --name-only
$staged = @($stagedRaw -split "`r?`n" | Where-Object { $_ })
if ($staged.Count -eq 0) {
  Write-RunLog "no enrichment changes — nothing to commit"
  Write-RunLog "=== done ==="
  exit 0
}

Write-RunLog "committing $($staged.Count) file(s):"
$staged | ForEach-Object { Write-RunLog "  $_" }

git commit -m "Scheduled enrichment refresh (auto)" 2>&1 | ForEach-Object {
  if ($_) { Write-RunLog "  $_" }
}
if ($LASTEXITCODE -ne 0) {
  Write-RunLog "ABORT: commit failed (rc=$LASTEXITCODE)"
  exit 1
}

# Remote may have advanced during the (often hours-long) enrichment run.
# Rebase our enrichment commit on top, retry on race.
for ($attempt = 1; $attempt -le 3; $attempt++) {
  git fetch origin 2>&1 | ForEach-Object { if ($_) { Write-RunLog "  $_" } }
  git rebase origin/main --autostash 2>&1 | ForEach-Object { if ($_) { Write-RunLog "  $_" } }
  if ($LASTEXITCODE -ne 0) {
    Write-RunLog "rebase failed on attempt ${attempt} — aborting rebase"
    git rebase --abort 2>$null
    exit 1
  }
  git push 2>&1 | ForEach-Object { if ($_) { Write-RunLog "  $_" } }
  if ($LASTEXITCODE -eq 0) {
    Write-RunLog "pushed on attempt ${attempt}"
    Write-RunLog "=== done ==="
    exit 0
  }
  $sleepSec = $attempt * 5
  Write-RunLog "push attempt ${attempt} failed; retrying in ${sleepSec}s"
  Start-Sleep -Seconds $sleepSec
}
Write-RunLog "all push attempts failed — local commit kept, will retry next run"
exit 1
