# Resizes the user-supplied loyalty reward + stamp PNGs from
# `User-made Resources/Loyalty Card pngs/` (large originals, ~1.78 MB total)
# down to 192×192 PNGs in `packages/desktop/src/renderer/assets/loyalty/`
# (~150 KB total) for use in the modal and customer landing page.
#
# Uses System.Drawing (ships with Windows .NET) so no extra npm deps.
# Re-run any time the source PNGs change.
#
# Usage (from repo root):
#   powershell -NoProfile -ExecutionPolicy Bypass -File packages\desktop\scripts\optimize-loyalty-assets.ps1

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path "$PSScriptRoot\..\..\..").Path
$src = Join-Path $repoRoot "User-made Resources\Loyalty Card pngs"
$dst = Join-Path $repoRoot "packages\desktop\src\renderer\assets\loyalty"
New-Item -ItemType Directory -Force -Path $dst | Out-Null

Add-Type -AssemblyName System.Drawing

$map = @{
  "Medium Fries.png"     = "medium-fries.png"
  "Large Shake.png"      = "large-shake.png"
  "Empanada Special.png" = "empanada-special.png"
  "Stamp.png"            = "stamp.png"
}

$size = 192
foreach ($k in $map.Keys) {
  $in  = Join-Path $src $k
  $out = Join-Path $dst $map[$k]
  if (-not (Test-Path $in)) {
    Write-Warning "Missing source: $in (skipping)"
    continue
  }
  $img = [System.Drawing.Image]::FromFile($in)
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g   = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($img, 0, 0, $size, $size)
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
  "{0,-24} {1,8:N0} -> {2,7:N0} bytes" -f $map[$k], (Get-Item $in).Length, (Get-Item $out).Length
}
