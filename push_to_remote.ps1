$repo='https://github.com/fredytsilavina-cell/erp-native.git'
try {
  git remote get-url origin | Out-Null
  Write-Host 'Origin exists'
} catch {
  git remote add origin $repo
  Write-Host 'Added origin'
}

$status = git status --porcelain
if ($status -ne '') {
  git add src/lib/mrp.ts src/__tests__/offlineStorage.test.ts src/components/AppShellHeader.tsx
  git commit -m 'Fix tests; optimistic notif update; lab block flow fixes'
  Write-Host 'Committed changes'
} else {
  Write-Host 'No changes to commit'
}

try {
  git push -u origin HEAD
} catch {
  Write-Host 'Push failed'
}

$TAG = 'deploy-' + (Get-Date -Format yyyyMMddHHmm)
$exists = git tag -l $TAG
if ($exists -ne '') {
  Write-Host "Tag $TAG already exists"
} else {
  git tag -a $TAG -m "deploy $TAG"
  Write-Host "Created tag $TAG"
}

try {
  git push origin --tags
} catch {
  Write-Host 'Push tags failed'
}
