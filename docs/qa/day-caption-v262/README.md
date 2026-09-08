# Timeline day caption — v262

Day header formerly put increased 14–16px date text inside the 46–48px event-time column, wrapping SEP 15. Header now spans its own row; weekday and date align on a baseline; date never wraps internally. Removed redundant next-colored header marker, leaving event Next marker intact.

check:ui and root dry run passed. Local one-item fixture at 320/390/430px: date height equals one line, weekday/date same line, no overflow, header marker hidden. Screenshot inspected. Standard multi-day fixture retains four tabs and hidden duplicate day header. No booking dates or sorting changed. Fixture temporary and not bundled.
