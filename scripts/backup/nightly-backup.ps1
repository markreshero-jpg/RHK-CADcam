# Nightly backup of the RHK-CADcam database + stored files to SynologyDrive.
# Run by the Windows scheduled task "RHK-CADcam nightly backup" (see z_sydney_migration spec).
#
#   1. pg_dump (full, custom format) to a LOCAL work folder  - never straight into the synced
#      folder: a dump written there once came out with blocks of NUL bytes.
#   2. Read the dump end to end with pg_restore to prove it is whole.
#   3. Copy it to SynologyDrive and check the copy's hash.
#   4. Mirror the stored files (adds + updates only).
#   5. Keep 30 nightly dumps + the first dump of every month.
# No secrets in here: the database password comes from .db-password-sydney.txt (git-ignored).

$ErrorActionPreference = 'Stop'
$repo    = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ref     = 'peqhxkesukmizvtsvweo'
$conn    = "host=aws-0-ap-southeast-2.pooler.supabase.com port=5432 dbname=postgres user=postgres.$ref sslmode=require connect_timeout=30"
$bin     = Join-Path $env:LOCALAPPDATA 'Programs\pgAdmin 4\runtime'
$work    = 'C:\Tools\rhk-backup\work'
$dest    = Join-Path $env:USERPROFILE 'SynologyDrive\RHK-CADcam Backups'
$nightly = Join-Path $dest 'nightly'
$storage = Join-Path $dest 'storage'
$log     = Join-Path $dest 'backup-log.txt'
$stamp   = Get-Date -Format 'yyyy-MM-dd'
$started = Get-Date

function Write-Log([string]$msg) { Add-Content -Path $log -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg) -Encoding utf8 }
# Native exes: Windows PowerShell turns stderr lines into errors when redirected, so run them through cmd.
function Invoke-Exe([string]$cmdLine) { cmd /c $cmdLine; return $LASTEXITCODE }

New-Item -ItemType Directory -Force $work, $nightly, $storage | Out-Null
try {
  $pwFile = Join-Path $repo '.db-password-sydney.txt'
  if (-not (Test-Path $pwFile)) { throw "database password file missing: $pwFile" }
  $env:PGPASSWORD = (Get-Content $pwFile -Raw).Trim()

  # 1. dump to the local work folder
  $name = "rhk-cadcam-$stamp.dump"
  $local = Join-Path $work $name
  if (Test-Path $local) { Remove-Item $local -Force -Confirm:$false }
  $code = Invoke-Exe "`"$bin\pg_dump.exe`" `"$conn`" -Fc --no-owner -f `"$local`" 2> `"$work\pg_dump.err`""
  if ($code -ne 0) { throw "pg_dump failed ($code): " + ((Get-Content "$work\pg_dump.err" -ErrorAction SilentlyContinue | Select-Object -First 3) -join ' | ') }

  # 2. read it end to end
  $code = Invoke-Exe "`"$bin\pg_restore.exe`" -f NUL `"$local`" 2> `"$work\pg_restore.err`""
  if ($code -ne 0) { throw "the dump does not read back cleanly ($code)" }
  $tables = (& "$bin\pg_restore.exe" --list $local | Select-String -SimpleMatch 'TABLE DATA public').Count
  if ($tables -lt 100) { throw "the dump lists only $tables public tables" }
  $sizeMb = [math]::Round((Get-Item $local).Length / 1MB, 1)

  # 3. copy to SynologyDrive, check the hash
  $final = Join-Path $nightly $name
  Copy-Item $local $final -Force
  if ((Get-FileHash $local -Algorithm SHA256).Hash -ne (Get-FileHash $final -Algorithm SHA256).Hash) { throw 'the copy in SynologyDrive differs from the local dump' }

  # 4. stored files
  $tsv = Join-Path $work 'objects.tsv'
  $q = "select bucket_id, name, metadata->>'size', metadata->>'eTag' from storage.objects where metadata is not null order by 1,2"
  $code = Invoke-Exe "`"$bin\psql.exe`" `"$conn`" -At -F `"`t`" -c `"$q`" -o `"$tsv`" 2> `"$work\psql.err`""
  if ($code -ne 0) { throw "listing stored files failed ($code)" }
  $storeOut = & node (Join-Path $PSScriptRoot 'storage-sync.cjs') $tsv $storage 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw ("stored files: " + $storeOut.Trim()) }

  # 5. retention: newest 30 + the first dump of each month
  $all = Get-ChildItem $nightly -Filter 'rhk-cadcam-*.dump' | Sort-Object Name -Descending
  $keep = @{}
  $all | Select-Object -First 30 | ForEach-Object { $keep[$_.Name] = $true }
  $all | Group-Object { $_.Name.Substring(11, 7) } | ForEach-Object { $keep[($_.Group | Sort-Object Name | Select-Object -First 1).Name] = $true }
  $removed = 0
  foreach ($f in $all) { if (-not $keep.ContainsKey($f.Name)) { Remove-Item $f.FullName -Force -Confirm:$false; $removed++ } }
  Get-ChildItem $work -Filter 'rhk-cadcam-*.dump' | Where-Object { $_.Name -ne $name } | Remove-Item -Force -Confirm:$false

  Get-ChildItem $dest -Filter 'BACKUP FAILED*.txt' | Remove-Item -Force -Confirm:$false
  $secs = [math]::Round(((Get-Date) - $started).TotalSeconds)
  Write-Log "OK  $name  $sizeMb MB, $tables tables; $($storeOut.Trim()); kept $($keep.Count) dumps, removed $removed; took $secs s"
  Write-Output "OK $name $sizeMb MB in $secs s; $($storeOut.Trim())"
  exit 0
}
catch {
  $msg = $_.Exception.Message
  Write-Log "FAILED  $msg"
  # A file you can't miss in the backup folder; cleared by the next good run.
  Set-Content -Path (Join-Path $dest "BACKUP FAILED $stamp.txt") -Value "The RHK-CADcam backup on $stamp did not complete:`r`n$msg`r`n`r`nSee backup-log.txt. Ask Claude to look at it." -Encoding utf8
  Write-Output "FAILED $msg"
  exit 1
}
finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
