# Deploys this folder to the linked Vercel project (production) with the PUBLIC / non-secret settings.
# Values are passed as deploy flags (-b = build-time, -e = runtime) so no stdin piping is needed.
# Secrets (SUPABASE_SERVICE_ROLE_KEY, EXPORT_TOKEN) are NOT set here - add them in the Vercel dashboard.
# Requires $env:VERCEL_TOKEN (or `vercel login`) in this window.
#
# Test deployment (default):
#   powershell -ExecutionPolicy Bypass -File scripts\vercel-setup.ps1 -Contact "Taiki Tazoe, MIT DUSP - you@mit.edu"
# Live deployment (real data collection; COUHES review not required per the course instructor):
#   powershell -ExecutionPolicy Bypass -File scripts\vercel-setup.ps1 -Live -Contact "Name, email"
param(
  [string]$Contact = '',
  [string]$EthicsRef = '',
  [switch]$Live
)
$ErrorActionPreference = 'Continue'
$url  = 'https://snmlhtqjeoqwhrimnrdh.supabase.co'
$anon = 'sb_publishable_1OeRi6fJq8VVl594PLMF2A_cQJEEbaj'

if ($Live -and -not $Contact.Trim()) {
  Write-Host 'Note: no -Contact given, so the consent page will not show a contact for questions.' -ForegroundColor Yellow
}
$mode = if ($Live) { 'live' } else { 'test' }

if (-not (Test-Path .vercel\project.json)) {
  npx.cmd --yes vercel@latest link --yes --project invisible-fares
}

$flags = @(
  '-b', "VITE_SUPABASE_URL=$url",
  '-b', "VITE_SUPABASE_ANON_KEY=$anon",
  '-b', "VITE_STUDY_MODE=$mode",
  '-e', "SUPABASE_URL=$url"
)
if ($Contact.Trim())   { $flags += @('-b', "VITE_STUDY_CONTACT=$Contact") }
if ($EthicsRef.Trim()) { $flags += @('-b', "VITE_ETHICS_APPROVAL_REF=$EthicsRef") }

Write-Host "Deploying in $mode mode..."
npx.cmd --yes vercel@latest deploy --prod --yes @flags

if ($LASTEXITCODE -eq 0) { Write-Host "DONE ($mode mode)" -ForegroundColor Green } else { Write-Host "FAILED (exit $LASTEXITCODE)" -ForegroundColor Red }
