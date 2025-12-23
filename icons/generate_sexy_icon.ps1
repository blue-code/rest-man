Add-Type -AssemblyName System.Drawing
$size = 1024
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.Clear([System.Drawing.Color]::Transparent)

# Define a "Sexy" Abstract R / Lightning Path
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
# A sharp, futuristic 'R' shape
# Points for a stylized, aggressive 'R'
$pts = @(
    (New-Object System.Drawing.PointF(200, 800)),  # Bottom-left start
    (New-Object System.Drawing.PointF(350, 200)),  # Top-left vertical-ish
    (New-Object System.Drawing.PointF(700, 200)),  # Top bar
    (New-Object System.Drawing.PointF(850, 450)),  # Right curve top
    (New-Object System.Drawing.PointF(650, 550)),  # Middle bar return
    (New-Object System.Drawing.PointF(450, 500)),  # Internal curve
    (New-Object System.Drawing.PointF(850, 850))   # Kick out
)

# Convert to a more "lightning" and "curved" path
$path.AddLines([System.Drawing.PointF[]]@(
        (New-Object System.Drawing.PointF(300, 850)), # Start
        (New-Object System.Drawing.PointF(450, 150)), # Top stroke
        (New-Object System.Drawing.PointF(850, 150)), # Right
        (New-Object System.Drawing.PointF(900, 450)), # Curve end
        (New-Object System.Drawing.PointF(600, 550)), # Middle break
        (New-Object System.Drawing.PointF(750, 550)), # Lightning kick in
        (New-Object System.Drawing.PointF(550, 650)), # Lightning kick down
        (New-Object System.Drawing.PointF(900, 950))  # End foot
    ))

# Glow Effect: Draw the path multiple times with increasing width and decreasing opacity
$colors = @(
    [System.Drawing.Color]::FromArgb(30, 0, 255, 255),
    [System.Drawing.Color]::FromArgb(60, 0, 200, 255),
    [System.Drawing.Color]::FromArgb(100, 0, 150, 255),
    [System.Drawing.Color]::FromArgb(255, 255, 255, 255) # Hard core
)

$widths = @(120, 80, 40, 15)

for ($i = 0; $i -lt $colors.Count; $i++) {
    $pen = New-Object System.Drawing.Pen($colors[$i], $widths[$i])
    $pen.StartCap = $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawPath($pen, $path)
    $pen.Dispose()
}

# Add a vibrant gradient fill to the main shape
$linGr = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Rectangle(0, 0, $size, $size)),
    [System.Drawing.Color]::FromArgb(255, 0, 255, 255), # Cyan
    [System.Drawing.Color]::FromArgb(255, 255, 0, 255), # Magenta/Violet
    45.0
)
$mainPen = New-Object System.Drawing.Pen($linGr, 20)
$mainPen.StartCap = $mainPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$mainPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$g.DrawPath($mainPen, $path)

$bmp.Save("C:\DEV\PYTHON_PROJECT\restman\sexy_symbolic_icon.png", [System.Drawing.Imaging.ImageFormat]::Png)

$mainPen.Dispose()
$linGr.Dispose()
$path.Dispose()
$g.Dispose()
$bmp.Dispose()
echo "Successfully generated a sexy symbolic icon."
