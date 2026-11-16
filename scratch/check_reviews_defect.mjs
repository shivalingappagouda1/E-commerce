import fs from 'fs';

const detail = fs.readFileSync('src/pages/customer/ProductDetailPage.jsx', 'utf8');
const linesDetail = detail.split(/\r?\n/);

console.log('=== SEARCH FOR REVIEWS / PRODUCT_NAME IN ProductDetailPage.jsx ===');
linesDetail.forEach((l, i) => {
  if (l.includes('product_name') || l.includes('reviews') || l.includes('fetchProductReviews') || l.includes('getReviews')) {
    console.log(`Detail L${i+1}: ${l.trim()}`);
  }
});

const service = fs.readFileSync('src/services/productService.js', 'utf8');
const linesService = service.split(/\r?\n/);
console.log('\n=== SEARCH FOR REVIEWS / PRODUCT_NAME IN productService.js ===');
linesService.forEach((l, i) => {
  if (l.includes('product_name') || l.includes('reviews') || l.includes('fetchProductReviews') || l.includes('getReviews')) {
    console.log(`Service L${i+1}: ${l.trim()}`);
  }
});
