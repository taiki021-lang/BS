# One-step live deploy: asks for the Vercel token (hidden input), then runs vercel-setup.ps1 -Live.
# Usage (from the invisible-fares folder):  powershell -ExecutionPolicy Bypass -File scripts\deploy-live.ps1
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not $env:VERCEL_TOKEN) {
  $s = Read-Host 'Paste your Vercel token and press Enter (input is hidden)' -AsSecureString
  $env:VERCEL_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}
& "$PSScriptRoot\vercel-setup.ps1" -Live -Contact 'Taiki Tazoe, MIT - taiki021@mit.edu'
$env:VERCEL_TOKEN = $null
