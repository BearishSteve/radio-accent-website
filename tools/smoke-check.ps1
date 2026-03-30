$root = Split-Path -Parent $PSScriptRoot
$checks = @(
  @{ Name = 'Playlist history'; File = 'api/playlist-history.php'; Get = @{ days = '7'; limit = '5' } },
  @{ Name = 'Playlist stats'; File = 'api/playlist-stats.php'; Get = @{ days = '7' } },
  @{ Name = 'CMS content'; File = 'api/content.php'; Get = @{} },
  @{ Name = 'Now playing'; File = 'api/now-playing.php'; Get = @{} },
  @{ Name = 'Health'; File = 'api/health.php'; Get = @{} },
  @{ Name = 'Weather'; File = 'api/weather.php'; Get = @{} }
)

function Invoke-PhpJsonCheck {
  param(
    [string]$Path,
    [hashtable]$Get = @{}
  )

  $phpPrelude = @(
    '$_SERVER["REQUEST_METHOD"] = "GET";'
  )

  if ($Get.Count -gt 0) {
    foreach ($key in $Get.Keys) {
      $safeValue = [string]$Get[$key] -replace "'", "\\'"
      $phpPrelude += "`$_GET['$key'] = '$safeValue';"
    }
  }

  $safePath = $Path -replace '\\', '/'
  $code = @"
<?php
$(($phpPrelude -join [Environment]::NewLine))
include '$safePath';
"@

  $output = $code | php
  if (-not $output) {
    throw "Geen output van $Path"
  }

  return $output | ConvertFrom-Json
}

$results = foreach ($check in $checks) {
  try {
    $payload = Invoke-PhpJsonCheck -Path (Join-Path $root $check.File) -Get $check.Get
    $note = if ($payload.ok) { 'OK' } else { [string]$payload.error }
    $isWeatherSoftFail = $check.Name -eq 'Weather' -and (
      $note -eq 'Weather API is not configured' -or
      $note -eq 'Weather service unavailable'
    )

    [pscustomobject]@{
      Check = $check.Name
      Ok = if ($isWeatherSoftFail) { $true } else { [bool]$payload.ok }
      Note = if ($isWeatherSoftFail) { "SKIPPED: $note" } else { $note }
    }
  } catch {
    [pscustomobject]@{
      Check = $check.Name
      Ok = $false
      Note = $_.Exception.Message
    }
  }
}

$results | Format-Table -AutoSize
