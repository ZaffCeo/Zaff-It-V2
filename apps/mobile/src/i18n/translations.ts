export type AppLanguage = 'en' | 'hi' | 'hi-Latn';

export const LANGUAGE_LABELS: Record<AppLanguage, { label: string; native: string }> = {
  en: { label: 'English', native: 'English' },
  hi: { label: 'Hindi', native: 'हिन्दी' },
  'hi-Latn': { label: 'Hinglish', native: 'Hinglish' },
};

export interface TranslationDictionary {
  // Common
  appName: string;
  continueBtn: string;
  retryBtn: string;
  cancelBtn: string;
  confirmBtn: string;
  loadingText: string;
  errorGeneric: string;
  offlineHint: string;

  // Onboarding / Splash
  onboardingTagline: string;
  onboardingSubtext: string;
  onboardingCta: string;
  dynamicEtaBadge: string;

  // Auth / Login OTP
  loginTitle: string;
  loginSubtitle: string;
  phoneLabel: string;
  phonePlaceholder: string;
  sendOtpBtn: string;
  otpLabel: string;
  otpPlaceholder: string;
  verifyOtpBtn: string;
  resendOtpBtn: string;
  changePhoneBtn: string;
  invalidPhoneError: string;
  invalidOtpError: string;
  privacyConsentPrefix: string;

  // Home
  deliveringTo: string;
  makranaServiceable: string;
  outsideServiceArea: string;
  voteForCityBtn: string;
  searchPlaceholder: string;
  askZaffyTitle: string;
  askZaffySubtitle: string;
  categoriesTitle: string;
  nearbyStoresTitle: string;
  featuredProductsTitle: string;
  addBtn: string;
  outOfStock: string;
  viewCartBtn: string;
  itemsInCart: string;
  etaUnit: string;

  // Cart & Checkout
  cartTitle: string;
  emptyCartTitle: string;
  emptyCartSubtitle: string;
  browseStoresBtn: string;
  billSummaryTitle: string;
  subtotalLabel: string;
  deliveryFeeLabel: string;
  handlingFeeLabel: string;
  discountLabel: string;
  grandTotalLabel: string;
  freeLabel: string;
  paymentMethodTitle: string;
  razorpayTitle: string;
  razorpaySubtitle: string;
  codTitle: string;
  codSubtitle: string;
  placeOrderBtn: string;
  validatingTotals: string;
  serverValidatedBadge: string;

  // Order Tracking
  trackingTitle: string;
  orderNumberLabel: string;
  liveStatusBadge: string;
  estimatedArrival: string;
  statusPending: string;
  statusAccepted: string;
  statusPacking: string;
  statusDispatched: string;
  statusDelivered: string;
  statusCancelled: string;
  deliveryOtpLabel: string;
  riderAssignedLabel: string;

  // Account & Compliance
  accountTitle: string;
  languageTitle: string;
  workspaceRoleTitle: string;
  legalSectionTitle: string;
  privacyPolicyTitle: string;
  termsOfServiceTitle: string;
  deleteAccountTitle: string;
  deleteAccountWarning: string;
  deleteAccountConfirmBtn: string;
  deleteAccountSuccess: string;
  logoutBtn: string;
}

export const TRANSLATIONS: Record<AppLanguage, TranslationDictionary> = {
  en: {
    appName: 'ZAFF-IT',
    continueBtn: 'Continue',
    retryBtn: 'Try Again',
    cancelBtn: 'Cancel',
    confirmBtn: 'Confirm',
    loadingText: 'Loading...',
    errorGeneric: 'Something went wrong. Please try again.',
    offlineHint: 'You appear offline. Saved cart items are still safe.',

    onboardingTagline: 'Makrana’s Local Stores, Delivered.',
    onboardingSubtext:
      'Groceries, dairy, staples, and daily essentials from trusted neighbourhood dukans with live dynamic ETAs.',
    onboardingCta: 'Get Started',
    dynamicEtaBadge: 'Live Store & Road ETA',

    loginTitle: 'Sign in with Phone',
    loginSubtitle: 'Enter your 10-digit Indian mobile number to receive a one-time code.',
    phoneLabel: 'Mobile Number',
    phonePlaceholder: '98290 12345',
    sendOtpBtn: 'Send OTP',
    otpLabel: 'Enter 6-Digit OTP',
    otpPlaceholder: '••••••',
    verifyOtpBtn: 'Verify & Continue',
    resendOtpBtn: 'Resend OTP',
    changePhoneBtn: 'Change Number',
    invalidPhoneError: 'Please enter a valid 10-digit mobile number.',
    invalidOtpError: 'Please enter the 6-digit OTP sent to your phone.',
    privacyConsentPrefix: 'By continuing, you agree to our Privacy Policy & Terms.',

    deliveringTo: 'Delivering to',
    makranaServiceable: 'Serviceable • Makrana Central',
    outsideServiceArea: 'Outside active delivery zone',
    voteForCityBtn: 'Vote for My Area',
    searchPlaceholder: 'Search atta, milk, kirana...',
    askZaffyTitle: 'Ask Zaffy AI',
    askZaffySubtitle: 'Find items, check prices, or scan a parchi list',
    categoriesTitle: 'Shop by Category',
    nearbyStoresTitle: 'Trusted Local Stores',
    featuredProductsTitle: 'Daily Essentials',
    addBtn: 'ADD',
    outOfStock: 'Out of stock',
    viewCartBtn: 'View Cart',
    itemsInCart: 'items',
    etaUnit: 'min',

    cartTitle: 'Cart & Checkout',
    emptyCartTitle: 'Your basket is empty',
    emptyCartSubtitle: 'Add groceries or daily essentials from a Makrana store to get started.',
    browseStoresBtn: 'Browse Stores',
    billSummaryTitle: 'Server-Validated Bill',
    subtotalLabel: 'Item Subtotal',
    deliveryFeeLabel: 'Delivery Fee',
    handlingFeeLabel: 'Handling Fee',
    discountLabel: 'Promo Discount',
    grandTotalLabel: 'To Pay',
    freeLabel: 'FREE',
    paymentMethodTitle: 'Payment Method',
    razorpayTitle: 'UPI / Cards (Razorpay)',
    razorpaySubtitle: 'GPay, PhonePe, Paytm, or Debit/Credit Card',
    codTitle: 'Cash on Delivery (COD)',
    codSubtitle: 'Pay cash or UPI at your doorstep',
    placeOrderBtn: 'Place Order',
    validatingTotals: 'Validating live prices...',
    serverValidatedBadge: 'Verified by Server',

    trackingTitle: 'Live Order Tracking',
    orderNumberLabel: 'Order',
    liveStatusBadge: 'LIVE',
    estimatedArrival: 'Dynamic ETA',
    statusPending: 'Order Placed',
    statusAccepted: 'Store Accepted',
    statusPacking: 'Packing Your Basket',
    statusDispatched: 'Rider On The Way',
    statusDelivered: 'Delivered',
    statusCancelled: 'Cancelled',
    deliveryOtpLabel: 'Handover PIN',
    riderAssignedLabel: 'Delivery Partner',

    accountTitle: 'Account & Compliance',
    languageTitle: 'App Language',
    workspaceRoleTitle: 'Switch Workspace Role',
    legalSectionTitle: 'Privacy & Legal',
    privacyPolicyTitle: 'Privacy Policy (DPDP Act)',
    termsOfServiceTitle: 'Terms of Service',
    deleteAccountTitle: 'Delete Account',
    deleteAccountWarning:
      'Your account will be scheduled for permanent deletion with a 30-day grace period. Active orders must be completed first.',
    deleteAccountConfirmBtn: 'Schedule Account Deletion',
    deleteAccountSuccess: 'Account deletion scheduled. You can cancel within 30 days by signing back in.',
    logoutBtn: 'Sign Out',
  },
  hi: {
    appName: 'ZAFF-IT',
    continueBtn: 'आगे बढ़ें',
    retryBtn: 'फिर कोशिश करें',
    cancelBtn: 'रद्द करें',
    confirmBtn: 'पुष्टि करें',
    loadingText: 'लोड हो रहा है...',
    errorGeneric: 'कुछ गड़बड़ हो गई। कृपया फिर से प्रयास करें।',
    offlineHint: 'आप ऑफ़लाइन हैं। आपका कार्ट सुरक्षित है।',

    onboardingTagline: 'मकराना की स्थानीय दुकानें, अब आपके घर।',
    onboardingSubtext:
      'किराना, दूध, और रोज़मर्रा का सामान भरोसेमंद दुकानों से लाइव अनुमानित समय के साथ।',
    onboardingCta: 'शुरू करें',
    dynamicEtaBadge: 'लाइव दुकान व रास्ता ETA',

    loginTitle: 'फ़ोन नंबर से साइन इन करें',
    loginSubtitle: 'ओटीपी पाने के लिए अपना 10 अंकों का मोबाइल नंबर दर्ज करें।',
    phoneLabel: 'मोबाइल नंबर',
    phonePlaceholder: '98290 12345',
    sendOtpBtn: 'OTP भेजें',
    otpLabel: '6 अंकों का OTP दर्ज करें',
    otpPlaceholder: '••••••',
    verifyOtpBtn: 'सत्यापित करें',
    resendOtpBtn: 'OTP दोबारा भेजें',
    changePhoneBtn: 'नंबर बदलें',
    invalidPhoneError: 'कृपया सही 10 अंकों का मोबाइल नंबर दर्ज करें।',
    invalidOtpError: 'कृपया फ़ोन पर आया 6 अंकों का OTP दर्ज करें।',
    privacyConsentPrefix: 'आगे बढ़कर आप हमारी गोपनीयता नीति और शर्तों से सहमत हैं।',

    deliveringTo: 'डिलीवरी स्थान',
    makranaServiceable: 'सेवा उपलब्ध • मकराना सेंट्रल',
    outsideServiceArea: 'डिलीवरी क्षेत्र से बाहर',
    voteForCityBtn: 'अपने क्षेत्र के लिए वोट करें',
    searchPlaceholder: 'आटा, दूध, किराना खोजें...',
    askZaffyTitle: 'Zaffy AI से पूछें',
    askZaffySubtitle: 'सामान खोजें, दाम देखें या पर्ची स्कैन करें',
    categoriesTitle: 'श्रेणी चुनें',
    nearbyStoresTitle: 'भरोसेमंद दुकानें',
    featuredProductsTitle: 'रोज़मर्रा की ज़रूरतें',
    addBtn: 'जोड़ें',
    outOfStock: 'स्टॉक समाप्त',
    viewCartBtn: 'कार्ट देखें',
    itemsInCart: 'आइटम',
    etaUnit: 'मिनट',

    cartTitle: 'कार्ट और चेकआउट',
    emptyCartTitle: 'आपका कार्ट खाली है',
    emptyCartSubtitle: 'शुरू करने के लिए मकराना की किसी दुकान से सामान जोड़ें।',
    browseStoresBtn: 'दुकानें देखें',
    billSummaryTitle: 'सर्वर-सत्यापित बिल',
    subtotalLabel: 'सामान का कुल',
    deliveryFeeLabel: 'डिलीवरी शुल्क',
    handlingFeeLabel: 'हैंडलिंग शुल्क',
    discountLabel: 'कूपन छूट',
    grandTotalLabel: 'कुल भुगतान',
    freeLabel: 'मुफ़्त',
    paymentMethodTitle: 'भुगतान का तरीका',
    razorpayTitle: 'UPI / कार्ड (Razorpay)',
    razorpaySubtitle: 'GPay, PhonePe, Paytm या डेबिट/क्रेडिट कार्ड',
    codTitle: 'कैश ऑन डिलीवरी (COD)',
    codSubtitle: 'डिलीवरी के समय नकद या UPI से भुगतान करें',
    placeOrderBtn: 'ऑर्डर करें',
    validatingTotals: 'दाम जाँचे जा रहे हैं...',
    serverValidatedBadge: 'सर्वर द्वारा सत्यापित',

    trackingTitle: 'लाइव ऑर्डर ट्रैकिंग',
    orderNumberLabel: 'ऑर्डर',
    liveStatusBadge: 'लाइव',
    estimatedArrival: 'अनुमानित समय',
    statusPending: 'ऑर्डर प्राप्त हुआ',
    statusAccepted: 'दुकान ने स्वीकार किया',
    statusPacking: 'सामान पैक हो रहा है',
    statusDispatched: 'राइडर रास्ते में है',
    statusDelivered: 'डिलीवर हो गया',
    statusCancelled: 'रद्द किया गया',
    deliveryOtpLabel: 'डिलीवरी पिन',
    riderAssignedLabel: 'डिलीवरी पार्टनर',

    accountTitle: 'अकाउंट और नियम',
    languageTitle: 'ऐप की भाषा',
    workspaceRoleTitle: 'रोल बदलें',
    legalSectionTitle: 'गोपनीयता और शर्तें',
    privacyPolicyTitle: 'गोपनीयता नीति (DPDP Act)',
    termsOfServiceTitle: 'सेवा की शर्तें',
    deleteAccountTitle: 'अकाउंट हटाएँ',
    deleteAccountWarning:
      'आपका अकाउंट 30 दिनों की अवधि के बाद स्थायी रूप से हटा दिया जाएगा। सक्रिय ऑर्डर पहले पूरे होने चाहिए।',
    deleteAccountConfirmBtn: 'अकाउंट हटाने का अनुरोध करें',
    deleteAccountSuccess: 'अकाउंट हटाने का अनुरोध दर्ज हो गया है।',
    logoutBtn: 'साइन आउट करें',
  },
  'hi-Latn': {
    appName: 'ZAFF-IT',
    continueBtn: 'Aage Badhein',
    retryBtn: 'Phir Try Karein',
    cancelBtn: 'Cancel Karein',
    confirmBtn: 'Confirm Karein',
    loadingText: 'Load ho raha hai...',
    errorGeneric: 'Kuch problem aa gayi. Dobara try karein.',
    offlineHint: 'Aap offline hain. Cart items safe hain.',

    onboardingTagline: 'Makrana ki Apni Dukanein, Ghar Tak.',
    onboardingSubtext:
      'Grocery, doodh, aur daily saman trusted local dukano se live dynamic ETA ke saath.',
    onboardingCta: 'Shuru Karein',
    dynamicEtaBadge: 'Live Store & Road ETA',

    loginTitle: 'Phone se Sign In Karein',
    loginSubtitle: 'OTP paane ke liye apna 10-digit mobile number daalein.',
    phoneLabel: 'Mobile Number',
    phonePlaceholder: '98290 12345',
    sendOtpBtn: 'OTP Bhejein',
    otpLabel: '6-Digit OTP Daalein',
    otpPlaceholder: '••••••',
    verifyOtpBtn: 'Verify Karein',
    resendOtpBtn: 'OTP Dobara Bhejein',
    changePhoneBtn: 'Number Badlein',
    invalidPhoneError: 'Sahi 10-digit mobile number daalein.',
    invalidOtpError: 'Phone par aaya 6-digit OTP daalein.',
    privacyConsentPrefix: 'Aage badhkar aap Privacy Policy aur Terms se sehmat hain.',

    deliveringTo: 'Delivery Location',
    makranaServiceable: 'Serviceable • Makrana Central',
    outsideServiceArea: 'Delivery zone se bahar hai',
    voteForCityBtn: 'Apne Area ke liye Vote Karein',
    searchPlaceholder: 'Atta, doodh, kirana search karein...',
    askZaffyTitle: 'Zaffy AI se Poochein',
    askZaffySubtitle: 'Saman dhundhein, rate check karein ya parchi scan karein',
    categoriesTitle: 'Category Chunein',
    nearbyStoresTitle: 'Trusted Local Dukanein',
    featuredProductsTitle: 'Daily Zaroorat',
    addBtn: 'ADD',
    outOfStock: 'Stock khatam',
    viewCartBtn: 'Cart Dekhein',
    itemsInCart: 'items',
    etaUnit: 'min',

    cartTitle: 'Cart aur Checkout',
    emptyCartTitle: 'Aapka basket khali hai',
    emptyCartSubtitle: 'Shuru karne ke liye Makrana ke kisi store se saman add karein.',
    browseStoresBtn: 'Stores Dekhein',
    billSummaryTitle: 'Server-Verified Bill',
    subtotalLabel: 'Saman Total',
    deliveryFeeLabel: 'Delivery Charge',
    handlingFeeLabel: 'Handling Charge',
    discountLabel: 'Coupon Discount',
    grandTotalLabel: 'Total Dena Hai',
    freeLabel: 'FREE',
    paymentMethodTitle: 'Payment Option',
    razorpayTitle: 'UPI / Cards (Razorpay)',
    razorpaySubtitle: 'GPay, PhonePe, Paytm ya Card se pay karein',
    codTitle: 'Cash on Delivery (COD)',
    codSubtitle: 'Delivery par cash ya UPI dein',
    placeOrderBtn: 'Order Place Karein',
    validatingTotals: 'Live rates check ho rahe hain...',
    serverValidatedBadge: 'Server Verified',

    trackingTitle: 'Live Order Tracking',
    orderNumberLabel: 'Order',
    liveStatusBadge: 'LIVE',
    estimatedArrival: 'Dynamic ETA',
    statusPending: 'Order Mila',
    statusAccepted: 'Dukan ne Accept Kiya',
    statusPacking: 'Saman Pack Ho Raha Hai',
    statusDispatched: 'Rider Raste Mein Hai',
    statusDelivered: 'Deliver Ho Gaya',
    statusCancelled: 'Cancel Hua',
    deliveryOtpLabel: 'Handover PIN',
    riderAssignedLabel: 'Delivery Partner',

    accountTitle: 'Account aur Rules',
    languageTitle: 'App Language',
    workspaceRoleTitle: 'Workspace Role Badlein',
    legalSectionTitle: 'Privacy aur Legal',
    privacyPolicyTitle: 'Privacy Policy (DPDP Act)',
    termsOfServiceTitle: 'Terms of Service',
    deleteAccountTitle: 'Account Delete Karein',
    deleteAccountWarning:
      'Aapka account 30-day grace window ke saath delete schedule hoga. Active orders pehle complete hone chahiye.',
    deleteAccountConfirmBtn: 'Account Deletion Schedule Karein',
    deleteAccountSuccess: 'Account deletion schedule ho gaya hai.',
    logoutBtn: 'Sign Out',
  },
};

export function getTranslation(language: AppLanguage): TranslationDictionary {
  return TRANSLATIONS[language] ?? TRANSLATIONS.en;
}
