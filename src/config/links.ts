// Canonical site constants. Single source of truth.
// If you change a URL here it propagates to every component that imports LINKS.
export const LINKS = {
  siteUrl: 'https://thewayofwealth.shop',
  siteName: 'Way of Wealth',
  quiz: 'https://money-beliefs-quiz.netlify.app',
  etsy: 'https://www.etsy.com/shop/WayofWealthStudio',
  cheatSheet: 'https://preview.mailerlite.io/forms/1977493/184455001091867806/share',
  contactEmail: 'mailto:joel@thewayofwealth.shop',
  coaching: '/coaching',
  portalApplyApi: 'https://portal.thewayofwealth.shop/api/leads/submit',
  // Legacy gmail kept intentionally for competitor funnel-hacking signups only.
  // Do NOT use for customer-facing contact or lead routing.
  funnelHackInbox: 'thewayofwealth.official@gmail.com',
} as const;
