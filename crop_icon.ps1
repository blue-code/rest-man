Add-Type -AssemblyName System.Drawing
$imagePath = "C:\DEV\PYTHON_PROJECT\restman\icon_to_edit.png"
$outputPath = "C:\DEV\PYTHON_PROJECT\restman\final_icon_source.png"

$src = [System.Drawing.Bitmap]::FromFile($imagePath)
$width = $src.Width
$height = $src.Height

# Crop the bottom 25% to remove text
$cropHeight = [int]($height * 0.75)
$rect = [System.Drawing.Rectangle]::new(0, 0, $width, $cropHeight)
$cropped = $src.Clone($rect, $src.PixelFormat)

# Create a square bitmap
$size = if ($width -gt $cropHeight) { $width } else { $cropHeight }
$square = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($square)
$g.Clear([System.Drawing.Color]::Transparent)

# Center the cropped image
$x = [int](($size - $width) / 2)
$y = [int](($size - $cropHeight) / 2)
$g.DrawImage($cropped, $x, $y, $width, $cropHeight)

# Make white background transparent
# We use a tolerance because the "white" might not be pure 255,255,255
for ($i = 0; $i -lt $square.Width; $i++) {
    for ($j = 0; $j -lt $square.Height; $j++) {
        $pixel = $square.GetPixel($i, $j)
        # If it's very close to white (R,G,B > 240), make it transparent
        if ($pixel.R -gt 240 -and $pixel.G -gt 240 -and $pixel.B -gt 240) {
            $square.SetPixel($i, $j, [System.Drawing.Color]::FromArgb(0, 255, 255, 255))
        }
    }
}

$square.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$square.Dispose()
$cropped.Dispose()
$src.Dispose()
echo "Finished processing icon"
