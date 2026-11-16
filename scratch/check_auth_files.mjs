import fs from 'fs';
import path from 'path';

console.log('=== CHECK AUTH & ROUTE PROTECTION FILES ===');

const authFiles = [
  'src/services/authService.js',
  'src/context/AuthContext.jsx',
  'src/components/common/ProtectedRoute.jsx',
  'src/components/common/AdminRoute.jsx',
  'src/routes.jsx',
  'src/App.jsx',
  'src/services/adminService.js',
  'src/services/cartService.js',
  'src/services/orderService.js',
  'src/services/productService.js'
];

authFiles.forEach(f => {
  if (fs.existsSync(f)) {
    console.log(`Found: ${f}`);
  } else {
    console.log(`MISSING: ${f}`);
  }
});
