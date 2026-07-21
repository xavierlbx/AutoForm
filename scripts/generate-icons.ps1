Add-Type -AssemblyName System.Drawing

function New-Icon {
  param(
    [int]$Size,
    [string]$Path
  )

  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $bg = [System.Drawing.Color]::FromArgb(255, 65, 45, 21)
  $brush = New-Object System.Drawing.SolidBrush $bg
  $pad = [Math]::Max(1, [int]($Size * 0.06))
  $radius = [Math]::Max(2, [int]($Size * 0.22))
  $rect = New-Object System.Drawing.Rectangle $pad, $pad, ($Size - 2 * $pad), ($Size - 2 * $pad)

  $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $gp.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $gp.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $gp.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $gp.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $gp.CloseFigure()
  $g.FillPath($brush, $gp)

  $penW = [Math]::Max(1, [int]($Size * 0.08))
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 225, 220, 201)), $penW
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  $m = [int]($Size * 0.28)
  $lineW = [int]($Size * 0.44)
  $y1 = [int]($Size * 0.34)
  $y2 = [int]($Size * 0.50)
  $y3 = [int]($Size * 0.66)
  $g.DrawLine($pen, $m, $y1, ($m + $lineW), $y1)
  $g.DrawLine($pen, $m, $y2, ($m + [int]($lineW * 0.7)), $y2)
  $g.DrawLine($pen, $m, $y3, ($m + [int]($lineW * 0.85)), $y3)

  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  $brush.Dispose()
  $pen.Dispose()
  $gp.Dispose()
  Write-Host "Wrote $Path"
}

$outDir = Join-Path $PSScriptRoot '..\icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
New-Icon -Size 16 -Path (Join-Path $outDir 'icon16.png')
New-Icon -Size 48 -Path (Join-Path $outDir 'icon48.png')
New-Icon -Size 128 -Path (Join-Path $outDir 'icon128.png')
