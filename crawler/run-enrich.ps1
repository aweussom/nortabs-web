<#
.SYNOPSIS
  Drive crawler/enrich.py letter-by-letter, sleeping through 5-hour quota resets.

.DESCRIPTION
  Reads the same quota cache that claude-code-quota maintains
  (~/.claude/quota-data.json). For each letter:
    1. Before running, if 5h usage >= ThresholdPct: sleep until quota reset + buffer.
    2. Run `python crawler/enrich.py --letter <l> --on-quota-limit exit`.
    3. After exit, re-check quota:
       - Still over threshold? Quota stopped mid-letter — sleep, then retry letter.
       - Under threshold? Letter is complete, move on.
    4. If enrich.py exits with 2 (consecutive-failure safety net): sleep 30 min then retry.

  Designed for unattended overnight/AFK runs. Resumable: enrich.py's diff logic
  means re-runs skip already-enriched entries — no risk of duplicate work or
  re-billing for the same prompts.

.PARAMETER Letters
  String of single-char letter codes to process in order. Default covers the
  full Norwegian alphabet + digits. Pass e.g. "abc" to limit.

.PARAMETER ThresholdPct
  Stop running new entries when 5h usage reaches this percent. Default 88.
  enrich.py uses its own threshold (default 90); we set this slightly lower so
  the wrapper notices first.

.PARAMETER LogPath
  Where to tee progress output. Default: crawler/enrich-run.log (gitignored).

.PARAMETER BufferSec
  Extra seconds added to each quota-reset sleep, to be safe. Default 60.

.EXAMPLE
  pwsh -File crawler/run-enrich.ps1
    # Runs the full A-9 sweep, pausing through quota resets as needed.

.EXAMPLE
  pwsh -File crawler/run-enrich.ps1 -Letters "åæø"
    # Only the Norwegian letters.

.EXAMPLE
  pwsh -File crawler/run-enrich.ps1 -ThresholdPct 80
    # More conservative — stops sooner before quota cap.
#>

param(
  [string]$Letters = "abcdefghijklmnopqrstuvwxyzæøå0123456789",
  [int]$ThresholdPct = 88,
  [string]$LogPath = "crawler/enrich-run.log",
  [int]$BufferSec = 60
)

$ErrorActionPreference = 'Continue'
$QuotaCache = Join-Path $env:USERPROFILE ".claude/quota-data.json"

function Write-Log {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Write-Host $line
  Add-Content -Path $LogPath -Value $line -Encoding utf8
}

function Read-Quota {
  if (-not (Test-Path $QuotaCache)) { return $null }
  try {
    $data = Get-Content $QuotaCache -Raw -Encoding utf8 | ConvertFrom-Json
    return @{
      pct       = $data.quota_used_pct
      resets_in = $data.resets_in
      stale     = [bool]$data.stale
    }
  } catch {
    return $null
  }
}

function Parse-ResetsInSec {
  param([string]$Text)
  # Parses "1 hr 12 min", "47 min", "2 hr" → seconds. Default 1 hr if unparseable.
  if (-not $Text) { return 3600 }
  $total = 0; $found = $false
  if ($Text -match '(\d+)\s*hr')  { $total += [int]$Matches[1] * 3600; $found = $true }
  if ($Text -match '(\d+)\s*min') { $total += [int]$Matches[1] * 60;   $found = $true }
  if ($found -and $total -gt 0) { return $total } else { return 3600 }
}

function Wait-ForQuotaReset {
  param([string]$Reason)
  $q = Read-Quota
  if (-not $q -or -not $q.resets_in) {
    Write-Log "no quota cache available — sleeping 1 hour as fallback ($Reason)"
    Start-Sleep -Seconds 3600
    return
  }
  $secs = Parse-ResetsInSec -Text $q.resets_in
  $total = $secs + $BufferSec
  $eta = (Get-Date).AddSeconds($total)
  Write-Log "quota at $($q.pct)% (resets_in '$($q.resets_in)') — sleeping $total sec until ~$($eta.ToString('HH:mm')) ($Reason)"
  Start-Sleep -Seconds $total
}

# Ensure log dir exists
$logDir = Split-Path -Parent $LogPath
if ($logDir -and -not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

Write-Log "=== enrich run starting: letters='$Letters' threshold=$ThresholdPct% buffer=${BufferSec}s ==="

$letterArray = $Letters.ToCharArray() | ForEach-Object { [string]$_ }

foreach ($letter in $letterArray) {
  Write-Log "--- letter '$letter' ---"

  # Pre-flight quota check
  $q = Read-Quota
  if ($q -and $q.pct -ge $ThresholdPct) {
    Wait-ForQuotaReset "pre-flight, before letter '$letter'"
  }

  $retry = 0
  while ($true) {
    Write-Log "running: python crawler/enrich.py --letter $letter (attempt $($retry + 1))"
    python crawler/enrich.py --letter $letter --on-quota-limit exit 2>&1 | ForEach-Object {
      $line = "[$(Get-Date -Format 'HH:mm:ss')]   $_"
      Write-Host $line
      Add-Content -Path $LogPath -Value $line -Encoding utf8
    }
    $rc = $LASTEXITCODE

    if ($rc -eq 0) {
      # Could be "letter done" OR "quota hit and enrich.py exited cleanly".
      # Disambiguate via post-run quota check.
      $q = Read-Quota
      if ($q -and $q.pct -ge $ThresholdPct) {
        Wait-ForQuotaReset "mid-letter '$letter', retrying"
        $retry++
        continue
      } else {
        Write-Log "letter '$letter' complete (rc=0, quota fine)"
        break
      }
    }
    elseif ($rc -eq 2) {
      # Consecutive-failure safety net fired. Likely quota stale or transient.
      Write-Log "letter '$letter' exited rc=2 (consecutive failures) — sleeping 30 min then retrying"
      Start-Sleep -Seconds 1800
      $retry++
      if ($retry -ge 5) {
        Write-Log "letter '$letter' too many retries ($retry) — skipping"
        break
      }
      continue
    }
    else {
      Write-Log "letter '$letter' unexpected exit rc=$rc — skipping"
      break
    }
  }
}

Write-Log "=== enrich run finished ==="
