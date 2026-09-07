// Central business configuration.
// IMPORTANT: Replace every "REPLACE_ME" value with real business details
// before launch. Placeholder values must never be presented as genuine.
export const BUSINESS = {
  legalName: "REPLACE_ME — Siesta Apparel Pvt. Ltd. (proposed legal name)",
  tradingName: "Siesta",
  supportEmail: "support@example.com  // REPLACE_ME",
  supportPhone: "+91-00000-00000  // REPLACE_ME — do not publish until real",
  businessAddress: "REPLACE_ME — full postal address, city, state, PIN",
  returnAddress: "REPLACE_ME — returns warehouse address",
  gstin: "REPLACE_ME — GSTIN (leave blank until registered)",
  cin: "REPLACE_ME — CIN if applicable",
  grievanceOfficer: "REPLACE_ME — name + email (Consumer Protection E-commerce Rules)",
  social: { instagram: "", x: "", youtube: "" }, // add only real URLs
  hours: "Mon–Sat, 10am–6pm IST (proposed)",
};

export const STORE = {
  currency: "INR",
  locale: "en-IN",
  freeShipThreshold: 1499,
  shipFlat: 79,
  codFee: 0,
  codMaxOrder: 20000,
  deliveryEtaDays: [3, 6],
  maxQtyPerLine: 10,
};

export const IMAGE_LICENSE = {
  note: "All product visuals on this build are original vector illustrations generated for Siesta. No third-party or brand photography is used.",
  source: "original-svg",
};

// Pre-launch checklist for owner + legal/tax review (rendered on /about + README).
export const LAUNCH_CHECKLIST = [
  "Replace all REPLACE_ME business details in js/config.js (legal name, address, email, phone, GSTIN).",
  "Have Terms, Privacy, Shipping, Refund and Cookie policies reviewed by a qualified Indian legal professional.",
  "Confirm GST invoicing, pricing-inclusive-of-tax display, and return-address workflow with a tax advisor.",
  "Appoint and publish grievance officer details per Consumer Protection (E-Commerce) Rules, 2020.",
  "Connect a real backend + database before accepting real payments; do not rely on browser storage for production orders.",
  "Integrate an authorised payment gateway for UPI/cards/netbanking; never collect card/CVV/UPI credentials in this frontend.",
  "Integrate a real courier partner before showing live tracking scans; current timeline is local order-state only.",
  "Replace support@example.com and placeholder phone with monitored business channels.",
  "Add only real social-media URLs; remove icons for accounts that do not exist.",
  "Run accessibility (keyboard, screen reader, contrast) and performance audits on real devices.",
];
