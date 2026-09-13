# Divisi Plan: Custom Group Pages + Carpool Map

Prepared for Divisi as a product/backend/frontend plan. This is a planning artifact only; it does not change the project.

## Product Decision

Build a reusable **Custom Group Pages** system, and ship **Carpool** as the first structured template.

The board's carpool request is specific, but the underlying need is broader: choir admins want lightweight coordination surfaces that do not deserve permanent first-class Divisi tabs. A page-template system can support carpool now and later cover potluck, concert logistics, costume notes, tour checklists, section resources, pronunciation handouts, rehearsal venue details, and similar group-specific workflows.

## Current Divisi Fit

Divisi already has the pieces this should build on:

- `GroupPageSettings` controls built-in page visibility with `enabled`, `audience`, and `min_identity`.
- Guest access already works through join codes and page-level gates.
- Responsibilities already provides a pattern for dated coordination, signups, anonymous participants, and admin assignment.
- Weekly Notes already provides a simple group-owned publishing flow.
- The local profile / anonymous participant work gives guests a progressive path into stateful actions.

This feature should extend those patterns rather than creating a separate one-off carpool area.

## Core Principles

- **Reusable first:** Carpool is a template, not a hard-coded permanent tab.
- **Structured, not arbitrary HTML:** Admins can compose safe blocks and templates, while Divisi owns layout, permissions, and data validation.
- **Privacy first:** Carpool locations can reveal home/work patterns. Default to approximate location sharing.
- **Low-friction member entry:** Singers should be able to add a ride offer or ride request quickly from a phone.
- **Admin-control preserved:** Group admins can publish, unpublish, moderate, and configure visibility.
- **Cost-controlled maps:** Google Maps should be optional per deployment and guarded with API restrictions, quotas, and graceful fallback.

## Feature Shape

Add a new built-in group tab:

```text
Pages
```

The tab contains custom pages created by admins.

```text
Pages
  Carpool to rehearsal
  Concert logistics
  Costume notes
  Potluck
```

Admins can create from templates:

```text
New page
  Blank info page
  Signup sheet
  Carpool board
  Potluck / snacks
  Event logistics
  Section resources
```

## Carpool Template

The carpool template creates a structured page with:

- Event/date selector
- Destination
- "I can drive" posts
- "I need a ride" posts
- Optional map
- Optional approximate route line
- Admin moderation controls
- Automatic archival after the event

Member-facing layout:

```text
Carpool to Wednesday Rehearsal

[Sep 16 rehearsal] [Sep 23 rehearsal] [Concert call]

I can drive                         Map
Name      From        Seats Notes   pins for drivers/riders
Maripi    Mission     3     leaving 6:15
Alex      Daly City   2     can stop near BART

I need a ride
Name      From        Notes
Jamie     Sunset      flexible
Priya     Oakland     can meet at BART

[I can drive] [I need a ride]
```

## Google Maps Recommendation

Use Google Maps for the carpool board only when a group enables the map option for that page.

Recommended first map version:

- Show approximate origin pins for drivers and riders.
- Show destination pin.
- Color pins by post type:
  - Driver: available seats
  - Rider: needs ride
  - Destination: rehearsal/concert location
- Let users choose "approximate area" rather than exact address.
- Avoid computing real routes in the first map milestone.

Recommended route/trajectory version:

- Let drivers add an optional route sketch:
  - origin
  - destination
  - optional pickup areas or waypoint labels
- Draw a simple app-side line between saved points first.
- Later, add Google Routes API only if people actually use route matching.
- Cache computed route polylines server-side if routes are added, so page views do not generate repeated route calls.

### Google Maps Platform Notes

Current official documentation says:

- Maps JavaScript API supports dynamic interactive maps for web apps.
- Advanced Markers require loading the `marker` library and using a map ID.
- Maps JavaScript API usage requires an API key or OAuth token and billing enabled.
- Dynamic Maps are billed per map load; Places and route-related APIs are billed separately.
- Current public pricing lists free monthly usage per SKU and pay-as-you-go rates after that.

Planning references:

- Maps JavaScript API overview: https://developers.google.com/maps/documentation/javascript
- Advanced Markers: https://developers.google.com/maps/documentation/javascript/advanced-markers/add-marker
- Maps JavaScript API usage and billing: https://developers.google.com/maps/documentation/javascript/usage-and-billing
- Google Maps Platform pricing: https://mapsplatform.google.com/pricing/
- Core services pricing list: https://developers.google.com/maps/billing-and-pricing/pricing

## Privacy Model

Default carpool pages should be **members-only**.

Suggested settings:

```text
Visibility:
  Members only       default
  Everyone with join link

Who can add entries:
  Members
  Saved profiles only
  Admins only

Location precision:
  Neighborhood / approximate area   default
  Exact pin                         optional, clear warning
```

Location handling:

- Store `location_label` separately from coordinates.
- Default coordinates should be approximate.
- If a user enters an exact address, save only the geocoded point plus a human label unless the user explicitly chooses to preserve the address text.
- Consider snapping/rounding approximate coordinates before save.
- Hide contact details from join-link guests by default.
- Expire or archive carpool entries after the event.
- Give users a clear delete action for their own posts.

Avoid showing:

- Full home addresses
- Phone numbers to guests
- Email addresses by default
- Historical ride patterns after the event

## Data Model

Add dynamic group pages separate from the existing static `GroupPage` enum.

```text
GroupCustomPage
  id
  group_id
  title
  slug
  nav_label
  template_key
  status: draft | published | archived
  audience: members | everyone
  min_identity: anyone | saved
  nav_order
  created_by
  created_at
  updated_at
```

Use blocks for reusable page structure:

```text
GroupPageBlock
  id
  page_id
  type: rich_text | links | signup_table | checklist | carpool_board
  sort_order
  config_json
  created_at
  updated_at
```

Use a specialized model for carpool because maps, seats, event dates, and privacy rules deserve validation.

```text
CarpoolEvent
  id
  page_id
  title
  starts_at
  destination_label
  destination_lat
  destination_lng
  destination_place_id
  status: open | locked | archived
  created_at
  updated_at
```

```text
CarpoolPost
  id
  event_id
  user_id
  display_name
  kind: driver | rider
  status: open | matched | hidden | cancelled
  origin_label
  origin_lat
  origin_lng
  origin_precision: approximate | exact
  seats_total
  seats_available
  leave_time_text
  return_trip: yes | no | maybe
  route_points_json
  contact_note
  notes
  created_at
  updated_at
```

Optional later:

```text
CarpoolMatch
  id
  driver_post_id
  rider_post_id
  status: requested | accepted | declined | cancelled
  created_by
  created_at
  updated_at
```

For MVP, skip `CarpoolMatch` and let members coordinate manually from the visible list.

## Backend API

Admin page management:

```text
GET    /groups/{group_id}/custom-pages
POST   /groups/{group_id}/custom-pages
GET    /groups/{group_id}/custom-pages/{slug}
PATCH  /groups/{group_id}/custom-pages/{page_id}
DELETE /groups/{group_id}/custom-pages/{page_id}
POST   /groups/{group_id}/custom-pages/{page_id}/publish
POST   /groups/{group_id}/custom-pages/{page_id}/archive
```

Member page reading:

```text
GET /groups/{group_id}/pages/{slug}
```

Guest page reading:

```text
GET /guest/{join_code}/pages/{slug}
```

Carpool:

```text
GET    /groups/{group_id}/pages/{page_id}/carpool/events
POST   /groups/{group_id}/pages/{page_id}/carpool/events
PATCH  /carpool/events/{event_id}
DELETE /carpool/events/{event_id}

GET    /carpool/events/{event_id}/posts
POST   /carpool/events/{event_id}/posts
PATCH  /carpool/posts/{post_id}
DELETE /carpool/posts/{post_id}
```

Guest carpool writes should be deferred until the privacy rules are proven. Guest read can exist if `audience = everyone`, but members-only should be the default.

## Maps Integration Architecture

Frontend:

```text
PUBLIC_GOOGLE_MAPS_API_KEY
PUBLIC_GOOGLE_MAPS_MAP_ID
```

Use:

- Maps JavaScript API for the map.
- Advanced Markers for driver/rider/destination pins.
- Optional Places Autocomplete for location entry.
- Optional Routes API later for real route polylines.

API key controls:

- Restrict key by HTTP referrer.
- Enable only required APIs.
- Put quota limits in Google Cloud Console.
- Monitor usage before enabling Maps for many groups.

Fallback:

- If Maps is unavailable or no API key is configured, render the same carpool list without the map.
- If Places Autocomplete is unavailable, let users type a location label and optionally place a pin manually.

Cost strategy:

1. First ship carpool list with typed location labels.
2. Add map loads only on the carpool page, not the whole group page shell.
3. Lazy-load the map after the carpool tab/page is visible.
4. Defer Places Autocomplete until the form is opened.
5. Avoid route calculations in MVP.
6. Cache any later route polyline result.

## Frontend UX

### Admin Pages Tab

```text
Pages

[Create page]

Published
  Carpool to rehearsal       Members only      In group nav
  Concert logistics          Everyone          In group nav

Drafts
  Potluck                    Members only      Hidden
```

Create page flow:

```text
Choose template
  Carpool board
  Blank info page
  Signup table
  Checklist

Configure
  Title
  Visibility
  Who can add entries
  Show in group navigation
  Optional map
```

### Carpool Member View

Desktop:

```text
┌──────────────────────────────────────────────────────────────┐
│ Carpool                                                      │
│ Sep 16 rehearsal                                             │
│ [I can drive] [I need a ride]                    [Map toggle]│
├───────────────────────────────┬──────────────────────────────┤
│ Drivers                       │ Map                          │
│ Maripi, Mission, 3 seats      │ driver/rider/destination pins│
│ Alex, Daly City, 2 seats      │                              │
│                               │                              │
│ Riders                        │                              │
│ Jamie, Sunset                 │                              │
│ Priya, Oakland                │                              │
└───────────────────────────────┴──────────────────────────────┘
```

Mobile:

```text
Carpool
Sep 16 rehearsal

[I can drive] [I need a ride]

[List] [Map]

Drivers
...

Riders
...
```

Post form:

```text
I can drive
  Name
  From
  Approximate pin
  Seats
  Leaving around
  Can return
  Contact / notes
```

```text
I need a ride
  Name
  From
  Approximate pin
  Time flexibility
  Contact / notes
```

### Admin Moderation

Admins can:

- Edit event dates and destination.
- Hide inappropriate or stale posts.
- Lock an event.
- Archive an event.
- Export a simple list if needed.

## Template System Scope

MVP templates:

```text
Carpool board
Blank info page
Signup table
Checklist
```

Block types:

```text
rich_text
links
signup_table
checklist
carpool_board
```

Avoid a drag-and-drop page builder in the first version. A template plus a few configurable blocks gives admins power without creating a full CMS.

## Permissions

Admin:

- Create, edit, publish, archive custom pages.
- Configure visibility and write requirements.
- Moderate all posts.

Member:

- Read visible member pages.
- Create/edit/delete their own carpool posts.
- Optionally claim or mark rides if that phase is built.

Anonymous participant:

- Can write only if page `min_identity = anyone`.
- Must provide display name before visible shared actions.
- Can be required to Save across devices if page `min_identity = saved`.

Join-link guest:

- Can read only pages with `audience = everyone`.
- Carpool write access should wait for a later milestone.

## Milestones

### B20/F24: Custom Group Pages Foundation

Acceptance criteria:

- Admin can create a custom page from a template.
- Admin can publish/unpublish/archive custom pages.
- Custom pages appear in a group's Pages tab.
- Custom pages respect `audience` and `min_identity`.
- Member route and guest route share the same access rules as existing group pages.
- No arbitrary HTML is accepted from admins.
- Tests cover access gates and slug uniqueness.

Backend tasks:

- Add `GroupCustomPage` and `GroupPageBlock`.
- Add migrations.
- Add page service access helpers.
- Add admin CRUD routes.
- Add member read route.
- Add guest read route.
- Add schemas.
- Seed no pages by default.

Frontend tasks:

- Add Pages tab to group page.
- Add admin page list.
- Add create-from-template flow.
- Add read-only page renderer.
- Add visibility controls.
- Add guest page rendering.
- Add i18n keys.

### B21/F25: Carpool Template Without Map

Acceptance criteria:

- Admin can create a carpool page.
- Admin can create carpool events.
- Members can add driver/rider posts.
- Members can edit/delete their own posts.
- Admins can moderate all posts.
- Event archives after the date or through admin action.
- The page is usable on mobile.

Backend tasks:

- Add `CarpoolEvent`.
- Add `CarpoolPost`.
- Add routes for events and posts.
- Enforce group membership and page access.
- Add retention/archive behavior.
- Add tests for ownership and admin moderation.

Frontend tasks:

- Add carpool template page renderer.
- Add event selector.
- Add driver/rider list.
- Add post forms.
- Add owner edit/delete.
- Add admin moderation actions.

### B22/F26: Carpool Map

Acceptance criteria:

- Admin can enable/disable the map per carpool page.
- Member can add an approximate pin to a post.
- The carpool page shows driver, rider, and destination pins.
- The page works without Google Maps configured.
- Map loads only after the carpool page is visible.
- API key is referrer-restricted and quota-limited.
- Tests mock the map loader rather than calling Google in CI.

Backend tasks:

- Add nullable latitude/longitude fields to `CarpoolEvent` and `CarpoolPost`.
- Add `origin_precision`.
- Add validation for coordinate ranges.
- Add optional `place_id`.
- Add privacy-safe response shapes.

Frontend tasks:

- Add Google Maps loader module.
- Add map component with Advanced Markers.
- Add marker colors and accessible list fallback.
- Add approximate pin picker.
- Add no-key/no-map fallback.
- Add config documentation for env vars.

### B23/F27: Route Sketches and Matching Signals

Acceptance criteria:

- Drivers can add optional pickup areas or a simple route sketch.
- Riders can see which drivers pass near their area.
- Route data is approximate unless exact sharing is enabled.
- No route API call happens on ordinary page view.

Backend tasks:

- Add `route_points_json`.
- Optionally add cached route polyline fields if using Routes API.
- Add tests for privacy-safe output.

Frontend tasks:

- Draw simple route lines between saved points.
- Add pickup area chips.
- Add "near this route" visual hint.
- Optionally link out to Google Maps directions.

## Testing Plan

Backend:

- Migration up/down checks.
- Page CRUD access tests.
- Slug uniqueness tests.
- Guest/member/admin access tests.
- Carpool ownership tests.
- Anonymous participant and `min_identity` tests.
- Coordinate validation tests.

Frontend:

- Unit tests for page/template adapters.
- Unit tests for carpool form validation.
- Mocked map-loader tests.
- Route-level tests for guest/member/admin states.
- Mobile layout pass.
- Manual browser pass with a real Google Maps key.

Do not hit live Google APIs in normal CI.

## Product Risks

- **Privacy:** Location sharing is sensitive. Default to approximate pins and members-only.
- **Cost:** Dynamic Maps and Places can create usage-based costs. Lazy-load, quota-limit, and skip Places in MVP if needed.
- **Scope creep:** A page builder can turn into a CMS. Keep templates constrained.
- **Moderation:** Carpool posts need admin hide/delete controls.
- **Contact info:** Divisi currently has no messaging. The first version should use notes/contact instructions and avoid exposing email or phone automatically.

## Open Decisions

- Should carpool pages ever be visible to join-link guests?
- Should riders be able to claim a specific driver seat, or should the board remain a contact list?
- Should exact address sharing exist at all?
- Should destination locations be per event, per group, or both?
- Should recurring rehearsal carpool events auto-generate from the group's rehearsal schedule?
- Should old carpool posts be deleted or archived after a fixed retention window?

## Recommended First Cut

Ship in this order:

1. Custom Pages foundation.
2. Carpool template as a list-based coordination board.
3. Approximate map pins using Google Maps.
4. Optional route sketches.
5. Generalize successful pieces into more templates.

This gives the choir board a strong carpool experience while creating a reusable Divisi capability for the next niche-but-real group request.
