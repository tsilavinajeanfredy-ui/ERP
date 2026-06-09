$URL='https://erp-i3imqrf7y-tsilavinas-projects-018b600b.vercel.app'
$out='prod_check.html'
$max=20
for ($i=1; $i -le $max; $i++) {
  Write-Host ("Attempt {0}: {1}" -f $i, (Get-Date -Format o))
  npx vercel curl $URL -- -o $out > $null
  if (Select-String -Path $out -Pattern 'AppEntry' -SimpleMatch -Quiet -Encoding UTF8 -ErrorAction SilentlyContinue) {
    Write-Host "FOUND AppEntry on attempt $i"
    exit 0
  }
  if (Select-String -Path $out -Pattern '/_expo/static/js/web' -SimpleMatch -Quiet -Encoding UTF8 -ErrorAction SilentlyContinue) {
    Write-Host "FOUND _expo path on attempt $i"
    exit 0
  }
  Start-Sleep -Seconds 30
}
Write-Host "NOT FOUND after $max attempts"
exit 2
