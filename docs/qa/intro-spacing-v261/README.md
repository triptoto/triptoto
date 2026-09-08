# Intro-to-card spacing — v261

Restored 24px bottom padding to shared Day Plan intro (also used by Add a booking). A late flat-style override previously removed the base padding. Save for Later, Planning and plan assignment already have spacing from their containers; preserved those to avoid doubled gaps.

check:ui and dry run passed. Browser checked five routes across 320/390/430px with no horizontal overflow. Add a booking/Day Plan text-to-card gap is 24px at each width. Other routes inspected, then their initially doubled padding reverted; no final changes to those selectors. Final Add a booking screenshot reviewed at 390px. Functionality unchanged.
