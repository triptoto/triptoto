# SEO and URL map

Only public product and legal pages are indexable. User trips, bookings, travel dates, locations, documents and account screens are private and must remain out of search.

| Route/template | Purpose | Public | Indexing | Canonical | Expected HTTP | Sitemap |
|---|---|---:|---|---|---:|---:|
| `/` | Product welcome page | Yes | `index, follow` | `https://tripto.to/` | 200 | Yes |
| `/privacy` | Privacy policy | Yes | `index, follow` | `https://tripto.to/privacy` | 200 | Yes |
| `/terms` | Terms of service | Yes | `index, follow` | `https://tripto.to/terms` | 200 | Yes |
| `/home` | App welcome alias/state | No | `noindex, nofollow` + robots disallow | Self path for navigation only | 200 | No |
| `/trips`, `/trips/:slug` | Private trip list/timeline | No | `X-Robots-Tag: noindex, nofollow` + robots disallow | Deep link | 200 | No |
| `/flights/:id`, `/hotels/:id`, `/trains/:id`, `/plans/:id` | Private booking detail | No | `X-Robots-Tag: noindex, nofollow` + robots disallow | Deep link | 200 | No |
| `/collections/:id`, `/collections/:id/places/:id` | Private plan/place detail | No | `X-Robots-Tag: noindex, nofollow` + robots disallow | Deep link | 200 | No |
| `/bookings/new/:type`, `/day-plan/new/:type`, `/trips/new` | Private create/edit forms | No | `X-Robots-Tag: noindex, nofollow` + robots disallow | Deep link | 200 | No |
| `/join/:token` | Private invitation flow | No | `X-Robots-Tag: noindex, nofollow` + robots disallow | Deep link | 200 | No |
| Other declared app routes | Private utilities/account/help | No | `X-Robots-Tag: noindex, nofollow` + robots disallow | Deep link | 200 | No |
| Unknown route | No resource | No | `X-Robots-Tag: noindex, nofollow` | None | 404 | No |

## Implemented technical SEO

- Static title, description, canonical, Open Graph, Twitter metadata and `WebSite` structured data on `/`.
- Unique static title, description and canonical on Privacy and Terms.
- XML sitemap contains only the three indexable URLs.
- `robots.txt` allows public pages and disallows private app route families.
- Worker routing distinguishes a valid private deep link from an unknown URL and adds an HTTP-level noindex header to private routes.
- HTTPS-only absolute canonical and social URLs use the apex domain.

## Google owner actions

1. Deploy the prepared build and run the post-deploy checks.
2. Add or confirm the `https://tripto.to/` Domain property in Google Search Console.
3. Submit `https://tripto.to/sitemap.xml`.
4. Inspect `/`, `/privacy`, and `/terms`; request indexing only for these pages.
5. Inspect one private route and one random missing route to confirm Google sees `noindex` and `404` respectively.

There is no `meta keywords` tag because Google does not require it. No fictitious company, address or contact data was added.
