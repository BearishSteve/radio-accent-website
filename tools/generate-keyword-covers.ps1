Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $root 'assets'
$fontsDir = Join-Path $assetsDir 'fonts'
$size = 1400

function New-Color([int]$r, [int]$g, [int]$b, [int]$a = 255) {
  return [System.Drawing.Color]::FromArgb($a, $r, $g, $b)
}

function Save-Jpeg($bitmap, [string]$path, [long]$quality = 90) {
  $encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters 1
  $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, $quality)
  $bitmap.Save($path, $encoder, $encoderParams)
  $encoderParams.Dispose()
}

function Load-FontCollection {
  $collection = New-Object System.Drawing.Text.PrivateFontCollection
  foreach ($fontFile in @(
    (Join-Path $fontsDir 'Manrope-Bold.ttf'),
    (Join-Path $fontsDir 'Manrope-SemiBold.ttf'),
    (Join-Path $fontsDir 'Teko-Bold.ttf')
  )) {
    if (Test-Path $fontFile) {
      $collection.AddFontFile($fontFile)
    }
  }
  return $collection
}

function Resolve-FontFamily($collection, [string]$name, [string]$fallback) {
  $family = $collection.Families | Where-Object { $_.Name -eq $name } | Select-Object -First 1
  if ($family) {
    return $family
  }
  return New-Object System.Drawing.FontFamily($fallback)
}

function New-Font($family, [float]$size, $style = [System.Drawing.FontStyle]::Regular) {
  return New-Object System.Drawing.Font($family, $size, $style, [System.Drawing.GraphicsUnit]::Pixel)
}

function New-Canvas([System.Drawing.Color]$start, [System.Drawing.Color]$end) {
  $bitmap = New-Object System.Drawing.Bitmap $size, $size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Rectangle 0, 0, $size, $size),
    $start,
    $end,
    55
  )
  $graphics.FillRectangle($brush, 0, 0, $size, $size)
  $brush.Dispose()
  return @($bitmap, $graphics)
}

Update-TypeData -TypeName System.Drawing.Graphics -MemberType ScriptMethod -MemberName FillRoundedRectangle -Value {
  param($brush, [System.Drawing.RectangleF]$rect, [float]$radius)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $radius * 2
  $path.AddArc($rect.X, $rect.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  $this.FillPath($brush, $path)
  $path.Dispose()
} -Force

Update-TypeData -TypeName System.Drawing.Graphics -MemberType ScriptMethod -MemberName DrawRoundedRectangle -Value {
  param($pen, [float]$x, [float]$y, [float]$width, [float]$height, [float]$radius)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  $this.DrawPath($pen, $path)
  $path.Dispose()
} -Force

function Draw-KeywordCover($path, $collection, [string]$label, [System.Drawing.Color]$start, [System.Drawing.Color]$end) {
  $bitmap, $graphics = New-Canvas $start $end

  $tekoFamily = Resolve-FontFamily $collection 'Teko' 'Arial'
  $manropeFamily = Resolve-FontFamily $collection 'Manrope' 'Segoe UI'

  $panelBrush = New-Object System.Drawing.SolidBrush((New-Color 255 255 255 10))
  $panelBorder = New-Object System.Drawing.Pen((New-Color 234 243 255 26), 4)
  $graphics.FillEllipse((New-Object System.Drawing.SolidBrush((New-Color 255 255 255 18))), 980, 86, 280, 280)
  $graphics.FillEllipse((New-Object System.Drawing.SolidBrush((New-Color 20 59 101 60))), -40, 1030, 420, 420)
  $graphics.FillRoundedRectangle($panelBrush, (New-Object System.Drawing.RectangleF 82, 82, 1236, 1236), 42)
  $graphics.DrawRoundedRectangle($panelBorder, 82, 82, 1236, 1236, 42)

  $badgeRect = New-Object System.Drawing.RectangleF 122, 122, 430, 104
  $badgeBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($badgeRect, (New-Color 255 226 74), (New-Color 255 193 7), 0)
  $graphics.FillRoundedRectangle($badgeBrush, $badgeRect, 24)

  $badgeFont = New-Font $manropeFamily 52 ([System.Drawing.FontStyle]::Bold)
  $badgeBrushText = New-Object System.Drawing.SolidBrush((New-Color 8 32 61))
  $badgeFormat = New-Object System.Drawing.StringFormat
  $badgeFormat.Alignment = [System.Drawing.StringAlignment]::Near
  $badgeFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
  $badgeFormat.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap
  $badgeTextRect = New-Object System.Drawing.RectangleF 152, 122, 370, 104
  $graphics.DrawString('Radio Accent', $badgeFont, $badgeBrushText, $badgeTextRect, $badgeFormat)

  $headlineFont = New-Font $tekoFamily 252 ([System.Drawing.FontStyle]::Bold)
  $headlineBrush = New-Object System.Drawing.SolidBrush((New-Color 247 251 255))
  $shadowBrush = New-Object System.Drawing.SolidBrush((New-Color 3 10 18 55))
  $headlineY = 520
  $graphics.DrawString($label.ToUpperInvariant(), $headlineFont, $shadowBrush, 120, $headlineY + 10)
  $graphics.DrawString($label.ToUpperInvariant(), $headlineFont, $headlineBrush, 120, $headlineY)

  $accentBrush = New-Object System.Drawing.SolidBrush((New-Color 255 226 74))
  $graphics.FillRoundedRectangle($accentBrush, (New-Object System.Drawing.RectangleF 126, 792, 320, 16), 8)

  Save-Jpeg $bitmap $path

  $accentBrush.Dispose()
  $shadowBrush.Dispose()
  $headlineBrush.Dispose()
  $headlineFont.Dispose()
  $badgeFormat.Dispose()
  $badgeBrushText.Dispose()
  $badgeFont.Dispose()
  $badgeBrush.Dispose()
  $panelBorder.Dispose()
  $panelBrush.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

$collection = Load-FontCollection

Draw-KeywordCover (Join-Path $assetsDir 'nieuws-cover.jpg') $collection 'Nieuws' (New-Color 12 44 81) (New-Color 4 19 35)
Draw-KeywordCover (Join-Path $assetsDir 'weer-cover.jpg') $collection 'Weer' (New-Color 27 93 153) (New-Color 9 29 53)
Draw-KeywordCover (Join-Path $assetsDir 'verkeer-cover.jpg') $collection 'Verkeer' (New-Color 14 48 85) (New-Color 5 20 37)
Draw-KeywordCover (Join-Path $assetsDir 'promo-cover.jpg') $collection 'Reclame' (New-Color 10 39 72) (New-Color 4 18 33)

$collection.Dispose()
