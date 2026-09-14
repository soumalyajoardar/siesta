// Central business configuration.
export const BUSINESS = {
  legalName: "Siesta Apparel Studio Pvt. Ltd.",
  tradingName: "Siesta",
  supportEmail: "concierge@siestastudio.in",
  supportPhone: "+91-80-4851-2200",
  businessAddress: "Studio Siesta, 42 Indiranagar 100ft Road, Bengaluru, Karnataka 560038",
  returnAddress: "Siesta Returns Centre, Plot 17, Whitefield Industrial Area, Bengaluru, Karnataka 560066",
  gstin: "29AABCS1234F1ZP",
  cin: "U18101KA2024PTC180042",
  grievanceOfficer: "Arjun Mehta, grievance@siestastudio.in",
  social: { instagram: "https://instagram.com/siestastudio", x: "", youtube: "" },
  hours: "Mon-Sat, 10:00 AM - 7:00 PM IST",
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
