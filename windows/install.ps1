<#
.SYNOPSIS
  File Explorer integration for Readown (current user only, no admin rights needed).

.DESCRIPTION
  - Adds "Mo bang Readown" / "Open with Readown" to the right-click menu of
    .md, .markdown, .mdown, .mkd and .mkdn files. It opens the file in Google Chrome, where the
    Readown extension renders it.
  - Registers "Readown" in "Open with", so you can make it the default for double-click.
  - Gives Markdown files the Readown icon when it is the chosen app.
  Only keys under HKCU\Software\Classes that this script owns are created; nothing else is changed.

.PARAMETER Uninstall
  Removes everything this script added.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File windows\install.ps1
  powershell -ExecutionPolicy Bypass -File windows\install.ps1 -Uninstall
#>
param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$Extensions = @('.md', '.markdown', '.mdown', '.mkd', '.mkdn')
$ProgId = 'Readown.Document'
$Verb = 'Readown'
$Classes = 'HKCU:\Software\Classes'
$Icon = Join-Path $PSScriptRoot 'readown.ico'
$ExtensionDir = (Resolve-Path (Join-Path $PSScriptRoot '..\extension')).Path
$MenuLabel = 'M' + [char]0x1EDF + ' b' + [char]0x1EB1 + 'ng Readown'   # Vietnamese label built from code points: this file stays ASCII for PowerShell 5.1
if ((Get-UICulture).TwoLetterISOLanguageName -ne 'vi') { $MenuLabel = 'Open with Readown' }

function Find-Chrome {
  foreach ($root in 'HKCU:', 'HKLM:') {
    $key = "$root\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"
    if (Test-Path $key) {
      $path = (Get-ItemProperty $key).'(default)'
      if ($path -and (Test-Path $path)) { return $path }
    }
  }
  foreach ($path in "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
                    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
                    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") {
    if (Test-Path $path) { return $path }
  }
  throw 'Google Chrome was not found.'
}

# Creates the key only if missing: New-Item -Force on an existing registry key would wipe its values.
function Set-RegValue([string]$Path, [string]$Name, [string]$Value) {
  if (-not (Test-Path $Path)) { New-Item -Path $Path -Force | Out-Null }
  if ($Name -eq '') { Set-Item -Path $Path -Value $Value }
  else { New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType String -Force | Out-Null }
}

function Update-Explorer {
  Add-Type -Namespace MdViewer -Name Shell -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("shell32.dll")]
public static extern void SHChangeNotify(int eventId, uint flags, System.IntPtr item1, System.IntPtr item2);
'@ -ErrorAction SilentlyContinue
  [MdViewer.Shell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)  # SHCNE_ASSOCCHANGED
}

function Test-ExtensionLoaded {
  # An unpacked extension is recorded with its folder path in the Chrome profile preferences.
  $needle = ($ExtensionDir -replace '\\', '\\')
  $files = Get-ChildItem "$env:LOCALAPPDATA\Google\Chrome\User Data\*\*Preferences" -ErrorAction SilentlyContinue
  foreach ($file in $files) {
    if ((Get-Content -Raw -LiteralPath $file.FullName -ErrorAction SilentlyContinue) -like "*$needle*") { return $true }
  }
  return $false
}

if ($Uninstall) {
  foreach ($ext in $Extensions) {
    $menu = "$Classes\SystemFileAssociations\$ext\shell\$Verb"
    if (Test-Path $menu) { Remove-Item $menu -Recurse }
    $owp = "$Classes\$ext\OpenWithProgids"
    if ((Test-Path $owp) -and ((Get-Item $owp).GetValueNames() -contains $ProgId)) {
      Remove-ItemProperty -Path $owp -Name $ProgId
    }
  }
  if (Test-Path "$Classes\$ProgId") { Remove-Item "$Classes\$ProgId" -Recurse }
  Update-Explorer
  Write-Host 'Readown: File Explorer integration removed.'
  return
}

if (-not (Test-Path $Icon)) { throw "Missing $Icon - run 'npm run build' first." }
$chrome = Find-Chrome
$command = "`"$chrome`" `"%1`""

# ProgID used by "Open with" / default app.
Set-RegValue "$Classes\$ProgId" '' 'Markdown document'
Set-RegValue "$Classes\$ProgId" 'FriendlyTypeName' 'Markdown document'
Set-RegValue "$Classes\$ProgId\DefaultIcon" '' $Icon
Set-RegValue "$Classes\$ProgId\Application" 'ApplicationName' 'Readown'
Set-RegValue "$Classes\$ProgId\Application" 'ApplicationIcon' $Icon
Set-RegValue "$Classes\$ProgId\shell\open" 'FriendlyAppName' 'Readown'
Set-RegValue "$Classes\$ProgId\shell\open" 'Icon' $Icon
Set-RegValue "$Classes\$ProgId\shell\open\command" '' $command

foreach ($ext in $Extensions) {
  Set-RegValue "$Classes\$ext\OpenWithProgids" $ProgId ''
  $menu = "$Classes\SystemFileAssociations\$ext\shell\$Verb"
  Set-RegValue $menu '' $MenuLabel
  Set-RegValue $menu 'Icon' $Icon
  Set-RegValue "$menu\command" '' $command
}
Update-Explorer

Write-Host "Readown: File Explorer integration installed (Chrome: $chrome)."
Write-Host "  - Right-click a .md file -> '$MenuLabel' (Windows 11: under 'Show more options')."
Write-Host "  - Double-click: right-click a .md -> Open with -> Choose another app -> Readown -> Always."
if (-not (Test-ExtensionLoaded)) {
  Write-Host ''
  Write-Host 'The extension is NOT loaded in Chrome yet, so .md files would show as plain text:' -ForegroundColor Yellow
  Write-Host '  1. chrome://extensions -> turn on Developer mode -> Load unpacked ->'
  Write-Host "     $ExtensionDir"
  Write-Host "  2. Details -> turn on 'Allow access to file URLs'."
}
