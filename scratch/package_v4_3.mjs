import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const pkgDir = path.resolve('scratch/phase6c_pkg_v4_3');
if (fs.existsSync(pkgDir)) {
  fs.rmSync(pkgDir, { recursive: true, force: true });
}

const files = [
  'database/schema.sql',
  'database/migrations/phase6c_order_and_checkout_corrections.sql',
  'database/migrations/phase6c_rollback.sql',
  'database/tests/phase6c_sql_tests.sql',
  'src/pages/customer/CheckoutPage.jsx',
  'src/services/adminService.js',
  'src/services/orderService.js',
  'scratch/test_true_concurrent_connections.mjs',
  'scratch/test_pglite_runner.mjs',
  'scratch/test_catalog_preflight.mjs',
  'scratch/test_checkout_idempotency_lifecycle.mjs',
  'package.json',
  'README_PHASE6C_VERIFICATION.md',
  'phase6c_final_corrections_dossier.md'
];

for (const rel of files) {
  const src = path.resolve(rel);
  if (!fs.existsSync(src)) {
    throw new Error(`File missing: ${src}`);
  }
  const dest = path.join(pkgDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

console.log(`Successfully staged ${files.length} files in ${pkgDir}`);

const zipPath = path.resolve('ShopKart_Phase6C_Final_Verification_Source_v4_3.zip');
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

execSync(`powershell -NoProfile -Command "$ProgressPreference = 'SilentlyContinue'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${pkgDir}', '${zipPath}')"`, { stdio: 'inherit' });

const stat = fs.statSync(zipPath);
console.log(`Created deliverable ZIP: ${zipPath}`);
console.log(`Size: ${stat.size} bytes`);
