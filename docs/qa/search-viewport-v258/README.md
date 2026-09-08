# Destination search viewport — v258

Destination overlay previously used fixed top:0 and 100svh plus keyboard padding, independently of the existing Safari visual viewport tracking. It now uses --app-viewport-offset and --app-viewport-height, without double keyboard subtraction. Underlying form header and footer are hidden while search is open; footer joins existing inert/aria-hidden handling and restores on close. Search header cannot flex-shrink.

Validation: check:ui, places-browser and app-viewport contracts passed. Browser geometry at 320x350, 390x420 and 430x500 confirms panel matches visible height and whole 62px input is visible and hit-testable at y80; underlying header hidden. Closing restores header and exits fullscreen. Real iPhone keyboard/toolbar offset not directly tested; desktop reduced viewport checks are not native iOS verification. Existing app-viewport contract covers visible height, keyboard reduction/restoration, pinch zoom and fallback.
