param(
  [int]$Port = 0,
  [string]$DataDir = (Join-Path $env:TEMP "degoog-site-test")
)

$ErrorActionPreference = "Stop"

function Stop-ChildProcess {
  param([System.Diagnostics.Process]$Process)
  if ($null -ne $Process -and -not $Process.HasExited) {
    try {
      Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    } catch {
      # Ignore cleanup failures.
    }
  }
}

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

if ($Port -le 0) {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  $Port = [int]$listener.LocalEndpoint.Port
  $listener.Stop()
}

$stdout = Join-Path $DataDir "server.out.log"
$stderr = Join-Path $DataDir "server.err.log"

Write-Output "Building project..."
bun run build

Write-Output "Starting server on http://127.0.0.1:$Port using data dir: $DataDir"
$cmd = "set DEGOOG_DATA_DIR=$DataDir&& set DEGOOG_PORT=$Port&& bun run src/server/index.ts"
$process = Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c", $cmd `
  -WorkingDirectory (Get-Location).Path `
  -PassThru `
  -RedirectStandardOutput $stdout `
  -RedirectStandardError $stderr

try {
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    if ($process.HasExited) {
      break
    }
    try {
      $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -eq 200) {
        $ready = $true
        break
      }
    } catch {
      # Keep waiting while the server warms up.
    }
  }

  if (-not $ready) {
    if ($process.HasExited) {
      throw "Server exited early. See $stdout and $stderr."
    }
    throw "Timed out waiting for http://127.0.0.1:$Port/."
  }

  $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 10
  if ($response.StatusCode -ne 200) {
    throw "Homepage returned HTTP $($response.StatusCode)."
  }

  Write-Output "Smoke test passed: homepage returned 200 OK."
  Write-Output "Server logs:"
  Get-Content $stdout
}
finally {
  Stop-ChildProcess -Process $process
}
