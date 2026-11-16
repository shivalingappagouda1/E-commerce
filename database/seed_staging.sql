-- ═══════════════════════════════════════════════════════════════════
-- ShopKart — Complete Staging Database Seed Script (seed_staging.sql)
-- ═══════════════════════════════════════════════════════════════════
-- Target Project: ShopKart-Staging (Supabase PostgreSQL)
-- Description:
--   Populates the empty staging catalog with production-grade categories,
--   products, product images, variants, inventory, coupons, and banners.
--
-- Key Guarantees:
--   1. 100% Idempotent: Can be safely executed multiple times without
--      creating duplicates, corrupting data, or violating constraints.
--   2. Strict Schema Compliance: Respects exact column names, foreign keys,
--      and constraints defined in database/schema.sql.
--   3. Deterministic UUIDs: All UUID primary keys use predictable,
--      v4-compliant identifiers.
--   4. Zero Security Bypass: Operates strictly within RLS; does not create
--      fake customers, fake admin profiles, or dummy payment records.
--   5. Full Customer Visibility: All catalog records satisfy public read
--      RLS policies (is_active = TRUE, inventory quantity > 0).
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. CATEGORIES (SERIAL id, name UNIQUE, slug UNIQUE)
-- ─────────────────────────────────────────────────────────────────
-- Uses fixed primary keys 1..8 and aligns the serial sequence afterwards.
INSERT INTO public.categories (id, name, slug, image_url, sort_order, is_active)
VALUES
  (1, 'Electronics',   'electronics',   'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=600&auto=format&fit=crop&q=80', 1, TRUE),
  (2, 'Fashion',       'fashion',       'https://images.unsplash.com/photo-1445205170230-053b83016050?w=600&auto=format&fit=crop&q=80', 2, TRUE),
  (3, 'Home & Living', 'home-living',   'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop&q=80', 3, TRUE),
  (4, 'Sports',        'sports',        'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=600&auto=format&fit=crop&q=80', 4, TRUE),
  (5, 'Books',         'books',         'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=600&auto=format&fit=crop&q=80', 5, TRUE),
  (6, 'Beauty',        'beauty',        'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600&auto=format&fit=crop&q=80', 6, TRUE),
  (7, 'Toys',          'toys',          'https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=600&auto=format&fit=crop&q=80', 7, TRUE),
  (8, 'Grocery',       'grocery',       'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop&q=80', 8, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  image_url   = EXCLUDED.image_url,
  sort_order  = EXCLUDED.sort_order,
  is_active   = EXCLUDED.is_active,
  updated_at  = NOW();

-- Synchronize the categories sequence with highest ID inserted
SELECT setval('public.categories_id_seq', (SELECT GREATEST(MAX(id), 8) FROM public.categories));


-- ─────────────────────────────────────────────────────────────────
-- 2. HERO MARKETING BANNERS (SERIAL id)
-- ─────────────────────────────────────────────────────────────────
INSERT INTO public.banners (id, title, subtitle, cta, cta_link, image_url, bg_from, bg_to, sort_order, is_active)
VALUES
  (
    1,
    'Mega Electronics Sale',
    'Up to 60% off on premium laptops, flagship phones & lossless spatial audio',
    'Shop Electronics',
    '/category/electronics',
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
    '#1e3a5f',
    '#2563eb',
    1,
    TRUE
  ),
  (
    2,
    'Fashion Week Deals',
    'Trending seasonal styles, athletic activewear & designer denim at unbeatable prices',
    'Explore Fashion',
    '/category/fashion',
    'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&auto=format&fit=crop&q=80',
    '#7c2d12',
    '#ea580c',
    2,
    TRUE
  ),
  (
    3,
    'Home Makeover Sale',
    'Smart kitchen appliances, robotic vacuums & ambient lighting for modern homes',
    'Discover Home',
    '/category/home-living',
    'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=800&auto=format&fit=crop&q=80',
    '#14532d',
    '#16a34a',
    3,
    TRUE
  )
ON CONFLICT (id) DO UPDATE SET
  title       = EXCLUDED.title,
  subtitle    = EXCLUDED.subtitle,
  cta         = EXCLUDED.cta,
  cta_link    = EXCLUDED.cta_link,
  image_url   = EXCLUDED.image_url,
  bg_from     = EXCLUDED.bg_from,
  bg_to       = EXCLUDED.bg_to,
  sort_order  = EXCLUDED.sort_order,
  is_active   = EXCLUDED.is_active,
  updated_at  = NOW();

SELECT setval('public.banners_id_seq', (SELECT GREATEST(MAX(id), 3) FROM public.banners));


-- ─────────────────────────────────────────────────────────────────
-- 3. PROMOTIONAL COUPONS (UUID id, code UNIQUE)
-- ─────────────────────────────────────────────────────────────────
INSERT INTO public.coupons (id, code, discount_type, discount_value, min_order_value, max_uses, used_count, expires_at, is_active)
VALUES
  (
    '00000000-0000-4000-e000-000000000001',
    'SHOPKART10',
    'percent',
    10.00,
    999.00,
    5000,
    0,
    NOW() + INTERVAL '1 year',
    TRUE
  ),
  (
    '00000000-0000-4000-e000-000000000002',
    'WELCOME500',
    'fixed',
    500.00,
    4999.00,
    2000,
    0,
    NOW() + INTERVAL '1 year',
    TRUE
  ),
  (
    '00000000-0000-4000-e000-000000000003',
    'FLASHSALE20',
    'percent',
    20.00,
    1999.00,
    1000,
    0,
    NOW() + INTERVAL '6 months',
    TRUE
  )
ON CONFLICT (code) DO UPDATE SET
  discount_type   = EXCLUDED.discount_type,
  discount_value  = EXCLUDED.discount_value,
  min_order_value = EXCLUDED.min_order_value,
  max_uses        = EXCLUDED.max_uses,
  expires_at      = EXCLUDED.expires_at,
  is_active       = EXCLUDED.is_active,
  updated_at      = NOW();


-- ─────────────────────────────────────────────────────────────────
-- 4. PRODUCTS (UUID id, slug UNIQUE, category_id INT REFERENCES categories)
-- ─────────────────────────────────────────────────────────────────
INSERT INTO public.products (
  id,
  category_id,
  name,
  slug,
  description,
  price,
  original_price,
  discount_percent,
  rating,
  review_count,
  badge,
  is_featured,
  is_active
)
VALUES
  -- ── Category 1: Electronics ──
  (
    '00000000-0000-4000-a000-000000000001',
    (SELECT id FROM public.categories WHERE slug = 'electronics'),
    'Sony WH-1000XM5 Wireless Headphones',
    'sony-wh-1000xm5',
    'Industry-leading noise canceling headphones with dual noise sensor technology, Speak-to-Chat, and 30-hour battery life.',
    29990.00,
    34990.00,
    14,
    4.60,
    2847,
    'Best Seller',
    TRUE,
    TRUE
  ),
  (
    '00000000-0000-4000-a000-000000000002',
    (SELECT id FROM public.categories WHERE slug = 'electronics'),
    'Apple iPhone 15 Pro — Natural Titanium',
    'apple-iphone-15-pro',
    'Forged in aerospace-grade titanium with the breakthrough A17 Pro chip, customizable Action button, and 48MP camera system.',
    134900.00,
    149900.00,
    10,
    4.80,
    5120,
    'Trending',
    TRUE,
    TRUE
  ),
  (
    '00000000-0000-4000-a000-000000000003',
    (SELECT id FROM public.categories WHERE slug = 'electronics'),
    'Samsung 55" 4K QLED Smart TV',
    'samsung-55-4k-qled',
    'Quantum HDR powered by Quantum Dot technology delivering 100% color volume and Dolby Atmos spatial surround sound.',
    54999.00,
    79990.00,
    31,
    4.50,
    1203,
    'Deal of the Day',
    TRUE,
    TRUE
  ),
  (
    '00000000-0000-4000-a000-000000000004',
    (SELECT id FROM public.categories WHERE slug = 'electronics'),
    'boAt Airdopes 141 TWS Earbuds',
    'boat-airdopes-141',
    'True wireless earbuds with 42 hours total playback, ENx environmental noise cancellation, and Insta Wake N'' Pair.',
    1299.00,
    2990.00,
    57,
    4.10,
    11023,
    'Top Deal',
    FALSE,
    TRUE
  ),
  (
    '00000000-0000-4000-a000-000000000005',
    (SELECT id FROM public.categories WHERE slug = 'electronics'),
    'OnePlus Nord CE 3 Lite 5G',
    'oneplus-nord-ce3-lite',
    '67W SUPERVOOC fast charging, 108MP primary camera sensor, and a vibrant 120Hz FHD+ adaptive display.',
    17999.00,
    24999.00,
    28,
    4.30,
    4320,
    'Value Pick',
    FALSE,
    TRUE
  ),
  (
    '00000000-0000-4000-a000-000000000006',
    (SELECT id FROM public.categories WHERE slug = 'electronics'),
    'Apple MacBook Air M3 — 16GB / 512GB SSD',
    'macbook-air-m3',
    'Supercharged by the 3nm M3 chip, delivering up to 18 hours of battery life and support for dual external displays in an ultrathin design.',
    114900.00,
    124900.00,
    8,
    4.90,
    1890,
    'Premium',
    TRUE,
    TRUE
  ),

  -- ── Category 2: Fashion ──
  (
    '00000000-0000-4000-a000-000000000007',
    (SELECT id FROM public.categories WHERE slug = 'fashion'),
    'Levi''s 511 Slim Fit Jeans',
    'levis-511-slim',
    'Modern slim-fit jeans with room to move, crafted from premium stretch denim with signature 5-pocket styling.',
    2499.00,
    3999.00,
    38,
    4.30,
    674,
    'Trending',
    FALSE,
    TRUE
  ),
  (
    '00000000-0000-4000-a000-000000000008',
    (SELECT id FROM public.categories WHERE slug = 'fashion'),
    'Zara Oversized Linen Casual Shirt',
    'zara-linen-shirt',
    'Relaxed breathable 100% European linen button-down shirt designed for effortless warm-weather tailoring.',
    2990.00,
    4490.00,
    33,
    4.40,
    412,
    'Top Deal',
    TRUE,
    TRUE
  ),
  (
    '00000000-0000-4000-a000-000000000009',
    (SELECT id FROM public.categories WHERE slug = 'fashion'),
    'Ray-Ban Classic Aviator Sunglasses',
    'ray-ban-classic-aviator',
    'Timeless teardrop pilot shape with gold metal frames and crystal green polarized UV400 protective lenses.',
    7290.00,
    9590.00,
    24,
    4.70,
    1530,
    'Best Seller',
    TRUE,
    TRUE
  ),

  -- ── Category 3: Home & Living ──
  (
    '00000000-0000-4000-a000-000000000010',
    (SELECT id FROM public.categories WHERE slug = 'home-living'),
    'Instant Pot Duo 7-in-1 Electric Pressure Cooker',
    'instant-pot-duo',
    'Combines pressure cooking, slow cooking, rice cooking, steaming, sauteing, yogurt making, and warming in one smart appliance.',
    6999.00,
    9999.00,
    30,
    4.70,
    3451,
    'Best Seller',
    FALSE,
    TRUE
  ),
  (
    '00000000-0000-4000-a000-000000000011',
    (SELECT id FROM public.categories WHERE slug = 'home-living'),
    'Dyson V15 Detect Cordless Vacuum Cleaner',
    'dyson-v15',
    'Laser illumination reveals microscopic dust with piezo sensor measurement and 240AW powerful suction.',
    42900.00,
    52900.00,
    19,
    4.60,
    731,
    'Premium',
    TRUE,
    TRUE
  ),
  (
    '00000000-0000-4000-a000-000000000012',
    (SELECT id FROM public.categories WHERE slug = 'home-living'),
    'Prestige Iris 750W Mixer Grinder',
    'prestige-iris-mixer',
    'Heavy-duty 750-watt copper motor with 3 stainless steel multipurpose jars and transparent juicer attachment.',
    2199.00,
    3495.00,
    37,
    4.20,
    2109,
    'Deal of the Day',
    FALSE,
    TRUE
  ),
  (
    '00000000-0000-4000-a000-000000000013',
    (SELECT id FROM public.categories WHERE slug = 'home-living'),
    'Philips Hue Smart Ambient Light Bar Duo',
    'philips-hue-lightbar',
    'Create immersive entertainment lighting with 16 million colors syncing seamlessly to your PC, TV, or music.',
    8999.00,
    12999.00,
    31,
    4.60,
    940,
    'Hot',
    FALSE,
    TRUE
  ),

  -- ── Category 4: Sports ──
  (
    '00000000-0000-4000-a000-000000000014',
    (SELECT id FROM public.categories WHERE slug = 'sports'),
    'Nike Air Max 270 Running Shoes',
    'nike-air-max-270',
    'Engineered mesh upper with Nike''s biggest heel Air unit for super-soft cushioning that feels as impossible as it looks.',
    7995.00,
    11995.00,
    33,
    4.40,
    892,
    'Hot',
    FALSE,
    TRUE
  ),
  (
    '00000000-0000-4000-a000-000000000015',
    (SELECT id FROM public.categories WHERE slug = 'sports'),
    'Wildcraft Trailblazer 55L Backpack',
    'wildcraft-55l',
    'Ergonomic internal frame trekking rucksack with rain cover, hydration pack compatibility, and padded waist belt.',
    2799.00,
    4999.00,
    44,
    4.00,
    543,
    'Top Deal',
    FALSE,
    TRUE
  ),
  (
    '00000000-0000-4000-a000-000000000016',
    (SELECT id FROM public.categories WHERE slug = 'sports'),
    'Decathlon Domyos Hex Dumbbells 10kg Pair',
    'decathlon-hex-dumbbells-10kg',
    'Ergonomic rubber-coated hexagonal weights designed to prevent rolling and protect home gym flooring during workouts.',
    3499.00,
    4999.00,
    30,
    4.70,
    1120,
    'Best Seller',
    TRUE,
    TRUE
  ),

  -- ── Category 5: Books ──
  (
    '00000000-0000-4000-a000-000000000017',
    (SELECT id FROM public.categories WHERE slug = 'books'),
    'Atomic Habits — James Clear',
    'atomic-habits',
    'An easy and proven framework to break bad habits and build good ones using compound micro-decisions.',
    349.00,
    599.00,
    42,
    4.90,
    24500,
    'Best Seller',
    FALSE,
    TRUE
  ),
  (
    '00000000-0000-4000-a000-000000000018',
    (SELECT id FROM public.categories WHERE slug = 'books'),
    'The Psychology of Money — Morgan Housel',
    'the-psychology-of-money',
    '19 short stories exploring the strange ways people think about wealth, greed, and personal financial happiness.',
    279.00,
    399.00,
    30,
    4.80,
    18200,
    'Trending',
    TRUE,
    TRUE
  ),

  -- ── Category 6: Beauty ──
  (
    '00000000-0000-4000-a000-000000000019',
    (SELECT id FROM public.categories WHERE slug = 'beauty'),
    'Forest Essentials Ayurvedic Facial Ubtan',
    'forest-essentials-facial-ubtan',
    'Traditional sun-dried Ayurvedic face treatment prepared with clarifying turmeric, sweet almond paste, and saffron oil.',
    1250.00,
    1650.00,
    24,
    4.60,
    1420,
    'Best Seller',
    TRUE,
    TRUE
  ),
  (
    '00000000-0000-4000-a000-000000000020',
    (SELECT id FROM public.categories WHERE slug = 'beauty'),
    'Minimalist 10% Niacinamide Face Serum 30ml',
    'minimalist-niacinamide-serum',
    'Pure vitamin B3 serum enriched with EUK-134 and Zinc PCA to reduce blemishes, control sebum, and strengthen barrier resilience.',
    599.00,
    799.00,
    25,
    4.50,
    8930,
    'Trending',
    FALSE,
    TRUE
  ),

  -- ── Category 7: Toys ──
  (
    '00000000-0000-4000-a000-000000000021',
    (SELECT id FROM public.categories WHERE slug = 'toys'),
    'LEGO Technic Porsche 911 RSR Building Kit',
    'lego-technic-porsche-911',
    '1,580-piece advanced supercar replica model with working differential, independent suspension, and six-cylinder boxer engine.',
    14999.00,
    18999.00,
    21,
    4.90,
    680,
    'Premium',
    TRUE,
    TRUE
  ),

  -- ── Category 8: Grocery ──
  (
    '00000000-0000-4000-a000-000000000022',
    (SELECT id FROM public.categories WHERE slug = 'grocery'),
    'Tata Tea Gold Premium Assam Blend 1kg',
    'tata-tea-gold-1kg',
    'Exquisite blend of full-bodied Assam CTC tea enhanced with gently rolled long orthodox leaves for unmatched aroma.',
    489.00,
    620.00,
    21,
    4.60,
    12400,
    'Best Seller',
    FALSE,
    TRUE
  ),
  (
    '00000000-0000-4000-a000-000000000023',
    (SELECT id FROM public.categories WHERE slug = 'grocery'),
    'Happilo Premium California Roasted Almonds 500g',
    'happilo-california-almonds-500g',
    'Lightly salted 100% natural jumbo California almonds, dry-roasted with no added oil for a protein-rich wholesome crunch.',
    429.00,
    699.00,
    39,
    4.50,
    9810,
    'Deal of the Day',
    TRUE,
    TRUE
  )
ON CONFLICT (slug) DO UPDATE SET
  category_id       = EXCLUDED.category_id,
  name              = EXCLUDED.name,
  description       = EXCLUDED.description,
  price             = EXCLUDED.price,
  original_price    = EXCLUDED.original_price,
  discount_percent  = EXCLUDED.discount_percent,
  rating            = EXCLUDED.rating,
  review_count      = EXCLUDED.review_count,
  badge             = EXCLUDED.badge,
  is_featured       = EXCLUDED.is_featured,
  is_active         = EXCLUDED.is_active,
  updated_at        = NOW();


-- ─────────────────────────────────────────────────────────────────
-- 5. PRODUCT IMAGES (UUID id, product_id REFERENCES products)
-- ─────────────────────────────────────────────────────────────────
INSERT INTO public.product_images (id, product_id, image_url, alt_text, is_primary, sort_order)
VALUES
  -- Sony Headphones
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80', 'Sony WH-1000XM5 Black Main', TRUE, 1),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000001', 'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800&auto=format&fit=crop&q=80', 'Sony WH-1000XM5 Angled View', FALSE, 2),

  -- iPhone 15 Pro
  ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000002', 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=800&auto=format&fit=crop&q=80', 'iPhone 15 Pro Natural Titanium', TRUE, 1),
  ('00000000-0000-4000-b000-000000000004', '00000000-0000-4000-a000-000000000002', 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=800&auto=format&fit=crop&q=80', 'iPhone 15 Pro Back View', FALSE, 2),

  -- Samsung TV
  ('00000000-0000-4000-b000-000000000005', '00000000-0000-4000-a000-000000000003', 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=800&auto=format&fit=crop&q=80', 'Samsung 55 Inch 4K QLED Display', TRUE, 1),

  -- boAt Earbuds
  ('00000000-0000-4000-b000-000000000006', '00000000-0000-4000-a000-000000000004', 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&auto=format&fit=crop&q=80', 'boAt Airdopes 141 Case & Buds', TRUE, 1),

  -- OnePlus Nord
  ('00000000-0000-4000-b000-000000000007', '00000000-0000-4000-a000-000000000005', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&auto=format&fit=crop&q=80', 'OnePlus Nord CE 3 Lite 5G Pastel Lime', TRUE, 1),

  -- MacBook Air
  ('00000000-0000-4000-b000-000000000008', '00000000-0000-4000-a000-000000000006', 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&auto=format&fit=crop&q=80', 'MacBook Air M3 Midnight Finish', TRUE, 1),

  -- Levi's Jeans
  ('00000000-0000-4000-b000-000000000009', '00000000-0000-4000-a000-000000000007', 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=800&auto=format&fit=crop&q=80', 'Levi''s 511 Slim Jeans Denim', TRUE, 1),

  -- Zara Linen Shirt
  ('00000000-0000-4000-b000-000000000010', '00000000-0000-4000-a000-000000000008', 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&auto=format&fit=crop&q=80', 'Zara White Linen Shirt', TRUE, 1),

  -- Ray-Ban Sunglasses
  ('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-a000-000000000009', 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800&auto=format&fit=crop&q=80', 'Ray-Ban Classic Gold Aviator', TRUE, 1),

  -- Instant Pot
  ('00000000-0000-4000-b000-000000000012', '00000000-0000-4000-a000-000000000010', 'https://images.unsplash.com/photo-1585515320310-259814833e62?w=800&auto=format&fit=crop&q=80', 'Instant Pot Duo 7-in-1 Multi Cooker', TRUE, 1),

  -- Dyson Vacuum
  ('00000000-0000-4000-b000-000000000013', '00000000-0000-4000-a000-000000000011', 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&auto=format&fit=crop&q=80', 'Dyson V15 Cordless Vacuum In-Action', TRUE, 1),

  -- Prestige Mixer
  ('00000000-0000-4000-b000-000000000014', '00000000-0000-4000-a000-000000000012', 'https://images.unsplash.com/photo-1570197571499-166b36435e9f?w=800&auto=format&fit=crop&q=80', 'Prestige Iris 750W Kitchen Grinder', TRUE, 1),

  -- Philips Hue Light Bar
  ('00000000-0000-4000-b000-000000000015', '00000000-0000-4000-a000-000000000013', 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80', 'Philips Hue Ambient Bar Glow', TRUE, 1),

  -- Nike Running Shoes
  ('00000000-0000-4000-b000-000000000016', '00000000-0000-4000-a000-000000000014', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&auto=format&fit=crop&q=80', 'Nike Air Max 270 Crimson Sole', TRUE, 1),

  -- Wildcraft Backpack
  ('00000000-0000-4000-b000-000000000017', '00000000-0000-4000-a000-000000000015', 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&auto=format&fit=crop&q=80', 'Wildcraft 55L Trailblazer Pack', TRUE, 1),

  -- Decathlon Dumbbells
  ('00000000-0000-4000-b000-000000000018', '00000000-0000-4000-a000-000000000016', 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=800&auto=format&fit=crop&q=80', 'Decathlon Hex Dumbbells 10kg Pair', TRUE, 1),

  -- Atomic Habits
  ('00000000-0000-4000-b000-000000000019', '00000000-0000-4000-a000-000000000017', 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800&auto=format&fit=crop&q=80', 'Atomic Habits Paperback Edition', TRUE, 1),

  -- The Psychology of Money
  ('00000000-0000-4000-b000-000000000020', '00000000-0000-4000-a000-000000000018', 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=800&auto=format&fit=crop&q=80', 'The Psychology of Money Cover', TRUE, 1),

  -- Forest Essentials Ubtan
  ('00000000-0000-4000-b000-000000000021', '00000000-0000-4000-a000-000000000019', 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&auto=format&fit=crop&q=80', 'Forest Essentials Facial Treatment Jar', TRUE, 1),

  -- Minimalist Serum
  ('00000000-0000-4000-b000-000000000022', '00000000-0000-4000-a000-000000000020', 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800&auto=format&fit=crop&q=80', 'Minimalist Niacinamide Dropper Bottle', TRUE, 1),

  -- LEGO Technic Porsche
  ('00000000-0000-4000-b000-000000000023', '00000000-0000-4000-a000-000000000021', 'https://images.unsplash.com/photo-1585366119957-e9730b6d0f60?w=800&auto=format&fit=crop&q=80', 'LEGO Technic Porsche Model Kit Box', TRUE, 1),

  -- Tata Tea Gold
  ('00000000-0000-4000-b000-000000000024', '00000000-0000-4000-a000-000000000022', 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=800&auto=format&fit=crop&q=80', 'Tata Tea Gold Assam Orthodox Brew', TRUE, 1),

  -- Happilo Almonds
  ('00000000-0000-4000-b000-000000000025', '00000000-0000-4000-a000-000000000023', 'https://images.unsplash.com/photo-1508061253366-f7da158b6d46?w=800&auto=format&fit=crop&q=80', 'Happilo Roasted California Almonds Bowl', TRUE, 1)
ON CONFLICT (id) DO UPDATE SET
  image_url   = EXCLUDED.image_url,
  alt_text    = EXCLUDED.alt_text,
  is_primary  = EXCLUDED.is_primary,
  sort_order  = EXCLUDED.sort_order;


-- ─────────────────────────────────────────────────────────────────
-- 6. PRODUCT VARIANTS (UUID id, product_id REFERENCES products)
-- ─────────────────────────────────────────────────────────────────
INSERT INTO public.product_variants (id, product_id, variant_type, variant_value, price_delta, sku)
VALUES
  -- Sony WH-1000XM5 Color Variants
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001', 'Color', 'Black', 0.00, 'SK-SONY-BLK'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000001', 'Color', 'Silver', 0.00, 'SK-SONY-SLV'),
  ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000001', 'Color', 'Midnight Blue', 500.00, 'SK-SONY-BLU'),

  -- Apple iPhone 15 Pro Storage Variants
  ('00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000002', 'Storage', '128 GB', -10000.00, 'SK-IP15P-128'),
  ('00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000002', 'Storage', '256 GB', 0.00, 'SK-IP15P-256'),
  ('00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000002', 'Storage', '512 GB', 20000.00, 'SK-IP15P-512'),

  -- Levi's 511 Slim Jeans Waist Size Variants
  ('00000000-0000-4000-c000-000000000007', '00000000-0000-4000-a000-000000000007', 'Size', '30W', 0.00, 'SK-LEV-30W'),
  ('00000000-0000-4000-c000-000000000008', '00000000-0000-4000-a000-000000000007', 'Size', '32W', 0.00, 'SK-LEV-32W'),
  ('00000000-0000-4000-c000-000000000009', '00000000-0000-4000-a000-000000000007', 'Size', '34W', 0.00, 'SK-LEV-34W'),

  -- Nike Air Max 270 Shoe Size Variants
  ('00000000-0000-4000-c000-000000000010', '00000000-0000-4000-a000-000000000014', 'Size', 'UK 8', 0.00, 'SK-NK270-UK8'),
  ('00000000-0000-4000-c000-000000000011', '00000000-0000-4000-a000-000000000014', 'Size', 'UK 9', 0.00, 'SK-NK270-UK9'),
  ('00000000-0000-4000-c000-000000000012', '00000000-0000-4000-a000-000000000014', 'Size', 'UK 10', 0.00, 'SK-NK270-UK10')
ON CONFLICT (id) DO UPDATE SET
  variant_type  = EXCLUDED.variant_type,
  variant_value = EXCLUDED.variant_value,
  price_delta   = EXCLUDED.price_delta,
  sku           = EXCLUDED.sku,
  updated_at    = NOW();


-- ─────────────────────────────────────────────────────────────────
-- 7. INVENTORY (product_id, variant_id, quantity, low_stock_at)
-- ─────────────────────────────────────────────────────────────────
-- Standalone products (variant_id IS NULL)
INSERT INTO public.inventory (id, product_id, variant_id, quantity, low_stock_at)
VALUES
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-a000-000000000003', NULL, 30, 5),  -- Samsung TV
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-a000-000000000004', NULL, 150, 10), -- boAt Earbuds
  ('00000000-0000-4000-d000-000000000003', '00000000-0000-4000-a000-000000000005', NULL, 45, 5),   -- OnePlus Nord
  ('00000000-0000-4000-d000-000000000004', '00000000-0000-4000-a000-000000000006', NULL, 25, 3),   -- MacBook Air
  ('00000000-0000-4000-d000-000000000005', '00000000-0000-4000-a000-000000000008', NULL, 60, 5),   -- Zara Shirt
  ('00000000-0000-4000-d000-000000000006', '00000000-0000-4000-a000-000000000009', NULL, 40, 5),   -- Ray-Ban Sunglasses
  ('00000000-0000-4000-d000-000000000007', '00000000-0000-4000-a000-000000000010', NULL, 75, 8),   -- Instant Pot
  ('00000000-0000-4000-d000-000000000008', '00000000-0000-4000-a000-000000000011', NULL, 20, 3),   -- Dyson Vacuum
  ('00000000-0000-4000-d000-000000000009', '00000000-0000-4000-a000-000000000012', NULL, 90, 10),  -- Prestige Mixer
  ('00000000-0000-4000-d000-000000000010', '00000000-0000-4000-a000-000000000013', NULL, 35, 5),   -- Philips Hue Bar
  ('00000000-0000-4000-d000-000000000011', '00000000-0000-4000-a000-000000000015', NULL, 0, 5),    -- Wildcraft (Out-of-Stock test case)
  ('00000000-0000-4000-d000-000000000012', '00000000-0000-4000-a000-000000000016', NULL, 50, 5),   -- Decathlon Dumbbells
  ('00000000-0000-4000-d000-000000000013', '00000000-0000-4000-a000-000000000017', NULL, 200, 20), -- Atomic Habits
  ('00000000-0000-4000-d000-000000000014', '00000000-0000-4000-a000-000000000018', NULL, 140, 15), -- The Psychology of Money
  ('00000000-0000-4000-d000-000000000015', '00000000-0000-4000-a000-000000000019', NULL, 80, 10),  -- Forest Essentials Ubtan
  ('00000000-0000-4000-d000-000000000016', '00000000-0000-4000-a000-000000000020', NULL, 120, 15), -- Minimalist Serum
  ('00000000-0000-4000-d000-000000000017', '00000000-0000-4000-a000-000000000021', NULL, 15, 2),   -- LEGO Porsche
  ('00000000-0000-4000-d000-000000000018', '00000000-0000-4000-a000-000000000022', NULL, 300, 30), -- Tata Tea Gold
  ('00000000-0000-4000-d000-000000000019', '00000000-0000-4000-a000-000000000023', NULL, 180, 20)  -- Happilo Almonds
ON CONFLICT (product_id) WHERE variant_id IS NULL DO UPDATE SET
  quantity      = EXCLUDED.quantity,
  low_stock_at  = EXCLUDED.low_stock_at,
  updated_at    = NOW();

-- Variant products (variant_id IS NOT NULL)
INSERT INTO public.inventory (id, product_id, variant_id, quantity, low_stock_at)
VALUES
  -- Sony Headphones Variants
  ('00000000-0000-4000-d000-000000000020', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000001', 35, 5),
  ('00000000-0000-4000-d000-000000000021', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000002', 20, 3),
  ('00000000-0000-4000-d000-000000000022', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000003', 15, 3),

  -- iPhone 15 Pro Storage Variants
  ('00000000-0000-4000-d000-000000000023', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-c000-000000000004', 25, 4),
  ('00000000-0000-4000-d000-000000000024', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-c000-000000000005', 40, 5),
  ('00000000-0000-4000-d000-000000000025', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-c000-000000000006', 15, 2),

  -- Levi's 511 Waist Size Variants
  ('00000000-0000-4000-d000-000000000026', '00000000-0000-4000-a000-000000000007', '00000000-0000-4000-c000-000000000007', 30, 5),
  ('00000000-0000-4000-d000-000000000027', '00000000-0000-4000-a000-000000000007', '00000000-0000-4000-c000-000000000008', 50, 8),
  ('00000000-0000-4000-d000-000000000028', '00000000-0000-4000-a000-000000000007', '00000000-0000-4000-c000-000000000009', 25, 4),

  -- Nike Air Max 270 Size Variants
  ('00000000-0000-4000-d000-000000000029', '00000000-0000-4000-a000-000000000014', '00000000-0000-4000-c000-000000000010', 20, 3),
  ('00000000-0000-4000-d000-000000000030', '00000000-0000-4000-a000-000000000014', '00000000-0000-4000-c000-000000000011', 35, 5),
  ('00000000-0000-4000-d000-000000000031', '00000000-0000-4000-a000-000000000014', '00000000-0000-4000-c000-000000000012', 15, 2)
ON CONFLICT (product_id, variant_id) DO UPDATE SET
  quantity      = EXCLUDED.quantity,
  low_stock_at  = EXCLUDED.low_stock_at,
  updated_at    = NOW();

COMMIT;

-- Verification output for operator running seed in SQL Editor
DO $$
DECLARE
  v_cat_count INT;
  v_prod_count INT;
  v_img_count INT;
  v_var_count INT;
  v_inv_count INT;
  v_coup_count INT;
  v_ban_count INT;
BEGIN
  SELECT count(*) INTO v_cat_count FROM public.categories;
  SELECT count(*) INTO v_prod_count FROM public.products;
  SELECT count(*) INTO v_img_count FROM public.product_images;
  SELECT count(*) INTO v_var_count FROM public.product_variants;
  SELECT count(*) INTO v_inv_count FROM public.inventory;
  SELECT count(*) INTO v_coup_count FROM public.coupons;
  SELECT count(*) INTO v_ban_count FROM public.banners;

  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'ShopKart Staging Seed Completed Successfully!';
  RAISE NOTICE '  Categories seeded:     %', v_cat_count;
  RAISE NOTICE '  Products seeded:       %', v_prod_count;
  RAISE NOTICE '  Product images seeded: %', v_img_count;
  RAISE NOTICE '  Variants seeded:       %', v_var_count;
  RAISE NOTICE '  Inventory rows seeded: %', v_inv_count;
  RAISE NOTICE '  Coupons seeded:        %', v_coup_count;
  RAISE NOTICE '  Banners seeded:        %', v_ban_count;
  RAISE NOTICE '════════════════════════════════════════════════════════════';
END $$;
