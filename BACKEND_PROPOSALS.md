# Divisi Backend Proposals

This document collects backend-focused product ideas for Divisi. The goal is to describe the data model, permissions, and system behavior before implementation work begins.

## Proposal: Group Responsibilities

Choirs often need members to sign up for recurring non-musical responsibilities. Divisi should support admin-created responsibility schedules where members can volunteer for specific roles.

Example:

> Each rehearsal needs 3 snack volunteers, 1 cleaning volunteer, and 2 gate control volunteers.

This feature belongs to groups. It should be managed by group admins and visible to group members.

## Core Use Cases

- Admin creates a recurring responsibility schedule for a group.
- Admin defines responsibility roles, needed headcount, dates, instructions, and deadlines.
- Members sign up for open responsibility slots.
- Members can see their upcoming responsibilities on Home.
- Admins can see coverage gaps and manually assign people if needed.
- Members receive reminders before their assigned date.

## User Roles

### Member

Members can:

- View upcoming responsibility dates for their groups.
- Sign up for open slots.
- Remove themselves before a cutoff, if allowed.
- See their assigned responsibilities on Home.

### Admin

Admins can:

- Create responsibility schedules.
- Edit dates, roles, headcount, instructions, and signup rules.
- Assign or remove members.
- Lock a signup date.
- Cancel a date.
- See which dates are fully covered, underfilled, or missing volunteers.

## Data Model Sketch

### Responsibility Schedule

Represents a recurring or one-off volunteer program inside a group.

Fields:

- `id`
- `group_id`
- `title`
- `description`
- `created_by_user_id`
- `status`: `active`, `paused`, `archived`
- `recurrence_rule`
- `start_date`
- `end_date`
- `created_at`
- `updated_at`

Example:

```text
Snack and rehearsal support
Every Thursday
Active
```

### Responsibility Role

Represents one kind of work needed for each date.

Fields:

- `id`
- `schedule_id`
- `name`
- `description`
- `needed_count`
- `sort_order`

Example roles:

```text
Snacks              needed_count: 3
Cleaning            needed_count: 1
Gate control        needed_count: 2
```

### Responsibility Date

Represents one occurrence of a schedule.

Fields:

- `id`
- `schedule_id`
- `group_id`
- `date`
- `title_override`
- `status`: `open`, `locked`, `cancelled`, `complete`
- `signup_deadline`
- `notes`

### Responsibility Signup

Represents one member filling one slot for one date and role.

Fields:

- `id`
- `responsibility_date_id`
- `responsibility_role_id`
- `user_id`
- `assigned_by_user_id`
- `source`: `self_signup`, `admin_assignment`
- `status`: `active`, `removed`
- `created_at`
- `removed_at`

## Coverage Logic

For each responsibility date and role:

```text
needed_count - active_signup_count = open_slots
```

Coverage states:

- `covered`: active signups meet the needed count.
- `underfilled`: active signups are below the needed count.
- `overfilled`: active signups exceed the needed count.
- `locked`: signups are closed.
- `cancelled`: the responsibility date is not active.

Admins should see coverage state at a glance.

## Member Experience

```text
Home

Upcoming responsibilities

Thu, Sep 3
Snacks for SFCC Chamber Choir

Thu, Sep 10
Gate control for SFCC Chamber Choir
```

```text
SFCC Chamber Choir

Responsibilities

Thu, Sep 3
Snacks              2 / 3 filled      [Sign up]
Cleaning            1 / 1 filled
Gate control        0 / 2 filled      [Sign up]
```

## Admin Experience

```text
SFCC Chamber Choir

Viewing as Admin

Responsibilities

Snack and rehearsal support
Thursdays

Sep 3               Underfilled
Snacks              2 / 3
Cleaning            1 / 1
Gate control        0 / 2

[Edit schedule]
[Assign members]
[Lock signups]
```

## Creation Flow

```text
New responsibility schedule

Title
[Snack and rehearsal support]

Repeats
[Weekly v]

Roles
Snacks              [3]
Cleaning            [1]
Gate control        [2]

Signup deadline
[24 hours before rehearsal v]

Member self-signup
[x] Allow members to sign up
[x] Allow members to remove themselves before deadline

Reminders
[x] Remind volunteers 2 days before
[x] Remind volunteers morning of

[Create schedule]
```

## Permissions

- Only group admins can create, edit, pause, archive, or delete responsibility schedules.
- Only group members can sign up for responsibility slots.
- Admins can assign any group member to a slot.
- Members can remove only their own signup, and only while the date is open.
- Admins can remove any signup.
- Archived schedules should remain visible in admin history but hidden from member signup flows.

## Notifications

Possible reminders:

- Signup reminder when an upcoming date is underfilled.
- Volunteer reminder before a member's assigned date.
- Admin alert when a responsibility date is close and underfilled.
- Change notification when an admin edits or cancels a responsibility date.

Notification channels can start in-app and later expand to email or push.

## Backend Considerations

- Store recurring schedules separately from generated responsibility dates.
- Generate dates lazily, for example 8-12 weeks ahead.
- Keep signups attached to concrete generated dates, not only recurrence rules.
- Use soft removal for signups so admins can audit changes.
- Enforce unique active signup per user, date, and role unless multiple slots per person are explicitly allowed.
- Consider a maximum-per-member rule later, such as "no more than one snack signup per month."

## Open Questions

- Should responsibilities appear as a fourth group tab, or live under group Home?
- Should members be able to swap responsibilities with each other?
- Should admins be able to require approval for signups?
- Should responsibility reminders use the same notification settings as homework reminders?
- Should personal calendar export be supported later?
- Should roles be reusable templates across groups?
