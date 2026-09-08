# Compact trip creation card — v257

Destination and dates now have matching 68px controls with 40px inset theme icon tiles, aligned on the same x coordinate. Removed redundant eyebrow, introductory copy, worldwide-search copy and reassurance. Destination header remains available in fullscreen search. Footer Next remains intact. Edit trip shares these controls; All Trips untouched.

Validation: check:ui, header-navigation and places-browser contracts passed. Real browser 320/390/430px: both controls 68px, both tiles 40px and x=46px, no horizontal overflow. Screenshot reviewed at 390px. Search Rome returned locations; selecting Rome Italy closed search; dates opened the calendar. Tests use local preview fixtures, no real trip created. Obsolete text-presence assertions updated to match intentionally removed copy.

Production commit 453d9db; Worker ea119b51-ff88-4a91-b783-2ce4ea08afa2. Public JS/CSS/index/service-worker hashes match local; /health healthy. Public trip creation preview after shell reload confirms both controls at 68px, old text removed, foreground inset icon and footer Next retained.
