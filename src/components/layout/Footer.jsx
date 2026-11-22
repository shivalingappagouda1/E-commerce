import { Link } from 'react-router-dom'
import { Globe, Share2, Camera, Play, Mail, Phone, MapPin } from 'lucide-react'

const LINKS = {
  Company:   [
    { label: 'About Us',      to: '/about' },
    { label: 'Careers',       to: '/careers' },
    { label: 'Press',         to: '/press' },
    { label: 'Blog',          to: '/blog' },
  ],
  Customer: [
    { label: 'Help Center',   to: '/help' },
    { label: 'Returns',       to: '/returns' },
    { label: 'Track Order',   to: '/track-order' },
    { label: 'Shipping Info', to: '/shipping' },
  ],
  Legal: [
    { label: 'Privacy Policy',    to: '/privacy' },
    { label: 'Terms of Service',  to: '/terms' },
    { label: 'Cookie Policy',     to: '/cookies' },
  ],
}

const SOCIALS = [
  { icon: Globe,   href: '#', label: 'Website'   },
  { icon: Share2,  href: '#', label: 'Share'     },
  { icon: Camera,  href: '#', label: 'Instagram' },
  { icon: Play,    href: '#', label: 'YouTube'   },
]

export default function Footer() {
  return (
    <footer className="bg-[#123B5A] text-[#DCEFFA] mt-12">
      {/* Trust strip */}
      <div className="border-b border-[#2B5B7A]">
        <div className="max-w-7xl mx-auto px-4 py-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-xs">
          {[
            { emoji: '🚚', label: 'Free Delivery',   sub: 'On orders above ₹499' },
            { emoji: '🔄', label: 'Easy Returns',    sub: '7-day hassle-free returns' },
            { emoji: '🔒', label: 'Secure Payments', sub: '100% protected' },
            { emoji: '🎧', label: '24/7 Support',    sub: 'Always here for you' },
          ].map(item => (
            <div key={item.label} className="flex flex-col items-center gap-1">
              <span className="text-2xl">{item.emoji}</span>
              <span className="font-semibold text-white">{item.label}</span>
              <span className="text-[#B9D2E2]">{item.sub}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main footer grid */}
      <div className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8">
        {/* Brand column */}
        <div className="lg:col-span-2 space-y-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-sm">SK</span>
            </div>
            <span className="text-white font-black text-xl tracking-tight">ShopKart</span>
          </Link>
          <p className="text-sm text-[#B9D2E2] leading-relaxed max-w-sm">
            Your one-stop destination for quality products at unbeatable prices.
            Shop millions of items across electronics, fashion, home and more.
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-[#B9D2E2]">
              <Mail size={14} className="text-brand-400" />
              <span>support@shopkart.in</span>
            </div>
            <div className="flex items-center gap-2 text-[#B9D2E2]">
              <Phone size={14} className="text-brand-400" />
              <span>1800-123-4567 (Toll Free)</span>
            </div>
            <div className="flex items-center gap-2 text-[#B9D2E2]">
              <MapPin size={14} className="text-brand-400" />
              <span>Bangalore, Karnataka, India</span>
            </div>
          </div>
        </div>

        {/* Link columns */}
        {Object.entries(LINKS).map(([heading, links]) => (
          <div key={heading}>
            <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wide">{heading}</h4>
            <ul className="space-y-2.5">
              {links.map(link => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-sm text-[#B9D2E2] hover:text-white transition-colors hover:translate-x-0.5 inline-block"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div className="border-t border-[#2B5B7A]">
        <div className="max-w-7xl mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[#A7C2D4]">
            © {new Date().getFullYear()} ShopKart. All rights reserved.
          </p>
          <div className="flex items-center gap-3">
            {SOCIALS.map(({ icon: Icon, href, label }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="p-1.5 rounded-full text-[#B9D2E2] hover:text-white hover:bg-[#195B87] transition-colors"
              >
                <Icon size={16} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
