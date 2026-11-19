# ShopKart product image upload update

Included source files:
- `src/pages/admin/AdminProductsPage.jsx`
- `src/services/adminService.js`
- `src/pages/customer/ProductDetailPage.jsx`
- `supabase/migrations/202611190001_product_image_storage.sql`

Features:
- Upload up to 10 images per product from your device.
- JPG, PNG, WEBP, GIF; maximum 5 MB each.
- Preview, remove, and set the primary image.
- Existing images are retained when editing.
- Uploads use Supabase Storage bucket `product-images`.
- Image URLs are stored in the existing `product_images` table.
- Product detail page shows the saved image gallery.

Installation:
1. Back up the three existing source files.
2. Replace them with the matching files in this ZIP.
3. Review the SQL migration and apply it only to ShopKart-Staging (`ulmwssozdmppvydppswx`) after confirming the target project.
4. Run `npm run build`, then test adding and editing a product.

The bucket is public-read and admin-write. The policies use `public.is_admin()`, so the existing OTP-verified admin session is required for uploads. The migration does not change product table columns.

Note: Replaced image records are removed, but old Storage objects are intentionally retained to avoid deleting assets still referenced elsewhere. Local demo mode can retain existing URLs but cannot persist newly selected local files; configure Supabase Storage for durable uploads.
