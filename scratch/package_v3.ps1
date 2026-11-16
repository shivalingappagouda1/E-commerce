$ErrorActionPreference = 'Stop'
$pkg = 'scratch\phase6c_pkg_v3'
if (Test-Path $pkg) { Remove-Item -Recurse -Force $pkg }

New-Item -ItemType Directory -Force -Path "$pkg\database\migrations" | Out-Null
New-Item -ItemType Directory -Force -Path "$pkg\database\tests" | Out-Null
New-Item -ItemType Directory -Force -Path "$pkg\src\pages\customer" | Out-Null
New-Item -ItemType Directory -Force -Path "$pkg\src\services" | Out-Null
New-Item -ItemType Directory -Force -Path "$pkg\scratch" | Out-Null

Copy-Item 'database\schema.sql' "$pkg\database\schema.sql"
Copy-Item 'database\migrations\phase6c_order_and_checkout_corrections.sql' "$pkg\database\migrations\phase6c_order_and_checkout_corrections.sql"
Copy-Item 'database\migrations\phase6c_rollback.sql' "$pkg\database\migrations\phase6c_rollback.sql"
Copy-Item 'database\tests\phase6c_sql_tests.sql' "$pkg\database\tests\phase6c_sql_tests.sql"
Copy-Item 'src\pages\customer\CheckoutPage.jsx' "$pkg\src\pages\customer\CheckoutPage.jsx"
Copy-Item 'src\services\adminService.js' "$pkg\src\services\adminService.js"
Copy-Item 'scratch\test_pglite_runner.mjs' "$pkg\scratch\test_pglite_runner.mjs"
Copy-Item 'scratch\test_true_concurrent_connections.mjs' "$pkg\scratch\test_true_concurrent_connections.mjs"
Copy-Item 'package.json' "$pkg\package.json"
Copy-Item 'README_PHASE6C_VERIFICATION.md' "$pkg\README_PHASE6C_VERIFICATION.md"
Copy-Item 'scratch\phase6c_pkg\phase6c_final_corrections_dossier.md' "$pkg\phase6c_final_corrections_dossier.md"

$zipPath = 'ShopKart_Phase6C_Final_Verification_Source_v3.zip'
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$sourceDir = (Resolve-Path $pkg).Path
$targetZip = Join-Path (Get-Location).Path $zipPath
[System.IO.Compression.ZipFile]::CreateFromDirectory($sourceDir, $targetZip)

Get-Item $zipPath | Select-Object Name, Length, LastWriteTime
