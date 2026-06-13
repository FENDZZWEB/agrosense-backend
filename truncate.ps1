param([string]$File)
$lines = Get-Content $File
for ($i = $lines.Count - 1; $i -ge 0; $i--) {
    if ($lines[$i] -match '</html>') {
        $lines[0..$i] | Set-Content $File -Encoding UTF8
        Write-Host "Truncated $File at line $($i+1)"
        break
    }
}
