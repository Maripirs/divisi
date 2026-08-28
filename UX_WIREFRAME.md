# Divisi, the choir companion app

Divisi helps singers practice choral music with the score, audio, assignments, and personal notes in one place.

The core idea is simple: choirs can share rehearsal tracks and homework, and singers can practice their own part with synced playback, sheet music, accompaniment, and annotations.

## Product Model

Divisi has two kinds of spaces:

- **Personal**: the singer's own practice library, annotations, recent pieces, and defaults.
- **Groups / Choirs**: shared rehearsal tracks, homework, members, and group administration.

A user can belong to one or more groups. A user can also administer a group, which gives them access to group setup, rehearsal-track management, homework creation, and member management.

## Implementation Direction For Claude

The next UX pass should focus on reducing duplicated concepts and making the app structure feel anchored.

### Navigation And Brand

- Treat **Divisi** as persistent app chrome, not as the title of every page.
- Anchor the brand in the top-left of the main app shell.
- Put global account/settings access in the top-right as **Settings** or a gear/profile button.
- Use page titles for the user's current place: **Home**, **Library**, **Groups**, **SFCC Chamber Choir**, **Settings**.
- Bottom nav should be: **Home | Library | Groups**.
- Remove **Me** from bottom nav. Its contents belong under global **Settings**.
- The player can use its own focused chrome: back button, piece title, and **Practice Setup** button. It does not need to show the Divisi brand while the score is open.

```text
Divisi                              Settings

Home

[main page content]

Bottom nav:
Home | Library | Groups
```

### Naming Rules

- Use **Settings** for global account and app defaults.
- Use **Practice Setup** for choices that affect the current piece, track, or assignment.
- Use **Group Settings** for admin-only group configuration.
- Use **Viewing as Member** and **Viewing as Admin** when a user has both roles in a group.
- Use singer-facing practice labels:
  - **Everyone**
  - **My part**
  - **My part + others**
  - **My part + accomp**
  - **Custom**

### Redundancy Rules

- Show **Divisi** once in the shell. Do not repeat it as a centered page title.
- Do not call the player drawer **Settings**.
- Do not repeat **Make this my default** under every control. Show one contextual prompt after a change.
- Do not make **Join group** the primary action after the user already belongs to groups.
- Do not show sparse empty sections unless they explain the next action.
- Keep Library and Groups distinct:
  - **Library** is for finding practice materials.
  - **Groups** is for membership, assignments, admin, and choir context.

## Core Concepts

### Groups

Groups represent choirs or ensembles.

Groups can have:

- Rehearsal tracks
- Homework assignments
- Members
- Admins
- Shared PDFs and playable score/audio files

### Homework

Homework is a task wrapper around a piece. It does not need to be a separate kind of media.

Example:

> Work on Lacrymosa, measures 18-42, by Friday.

Homework can include:

- Piece
- Measure range
- Due date
- Instructions from the director
- Link into the practice player
- PDF access

### Rehearsal Tracks

Rehearsal tracks are the practice materials attached to a group or personal library.

Each track can offer:

- Player
- PDF
- Score/audio setup
- Personal annotations

### Annotations

Annotations belong to the user. They can be attached to a track, measure, beat, or playback position.

By default, annotations should be private. The user can choose to share them later.

Possible sharing states:

- Private to me
- Shared with director
- Shared with selected people
- Shared with group

## Home Screen Goal

The home screen should answer:

> What should I practice now?

It should stay calm and focused. It should not become the full library.

## Welcome Screen

The welcome screen explains the app's mental model. It should feel like orientation, not marketing.

```text
Divisi

The choir companion app

Practice choral music with the score, audio, and your part in sync.

[Get started]

How Divisi works

1. Join a choir or practice on your own
Your choir can share rehearsal tracks and homework.
You can also keep personal pieces in your own library.

2. Choose what you need to hear and see
Practice your part alone, with accompaniment, or inside the full score.

3. Follow the music as it plays
The score moves with the audio, so you always know where you are.

4. Add notes for yourself
Mark entrances, vowels, breaths, or tricky measures.
Your annotations are private unless you choose to share them.

[Join a group]
[Explore demo]
```

## Home Wireframe

```text
Divisi                              Settings

Home

[Next practice]
Lacrymosa
mm. 18-42
Due Friday
SFCC Chamber Choir
[Start]

[Continue]
The Challenge of Thor
Alto + accomp
Last opened 20 min ago
[Resume]

[Due soon]
Friday
- Lacrymosa, mm. 18-42
- Der Abend, full piece

Next week
- Proserpine, mm. 1-30

[My groups]
SFCC Chamber Choir
3 active assignments

Community Chorus
1 active assignment

[Recent annotations]
Lacrymosa, m. 24
"Watch entrance after bass."

The Challenge of Thor, m. 12
"Check vowel here."

[Quick actions]
[Add personal piece]
[Open personal library]
[Join or create group]

Bottom nav:
Home | Library | Groups
```

## Groups Wireframe

```text
Divisi                              Settings

Groups

[My groups]
SFCC Chamber Choir                  Member + Admin
4 active assignments

Community Chorus                    Member
No active assignments

[Join a group]
[Create a group]

Bottom nav:
Home | Library | Groups
```

## Create Group Flow

Group creation should live in **Groups**, since it creates a choir space. The user who creates a group becomes its first admin.

```text
Groups

[Join a group]
[Create a group]
```

```text
Create group

Group name
[________________]

Description
[________________]

Default sections
[x] Soprano
[x] Alto
[x] Tenor
[x] Bass
[ ] Other

You will be the group admin.

[Create group]
```

```text
SFCC Chamber Choir created

Join code
ABCD-1234

[Invite members]
[Add rehearsal track]
[Create homework]
[View group]
```

## Group Page Wireframe

```text
Divisi                              Settings

SFCC Chamber Choir

Viewing as Member                   Switch to Admin

Tabs:
[Homework] [Rehearsal Tracks] [Members] [Info]

Homework

Due Friday
Lacrymosa
Measures 18-42
"Focus on entrances after rests."
[Practice assignment] [Open PDF]

Due next week
The Challenge of Thor
Full piece
"Review text and rhythm."
[Practice assignment] [Open PDF]
```

If the user is also an admin, the role switcher should be visible near the group title. Member view should stay singer-focused and hide editing controls.

```text
SFCC Chamber Choir

Viewing as Admin                    Switch to Member

Tabs:
[Assignments] [Tracks] [Members] [Settings]

Assignments
4 active
[+ New homework]

Tracks
4 shared
[+ Add track]

Members
40 people
[Invite member]
[Manage roles]
```

## Rehearsal Tracks Wireframe

```text
SFCC Chamber Choir > Rehearsal Tracks

Search...

Mozart - Lacrymosa
SATB + Piano
[Practice] [PDF]

Elgar - The Challenge of Thor
SATB + Accomp
[Practice] [PDF]

Brahms - Der Abend
SATB
[Practice] [PDF]
```

## Homework Detail Wireframe

```text
Lacrymosa Assignment

Due Friday, Aug 28
Measures 18-42

Instructions:
Focus on entrances after rests.

Your setup:
Voice: [Soprano v]
View: [My part + accomp v]

[Start Practice]

Resources:
[Open PDF]
[Full piece]
[My annotations]
```

## Practice Player Wireframe

The practice player should make the music the most important part of the interface.

The score should use the majority of the screen. Transport controls should be available without fighting the sheet music. Mixer and setup controls can live in a drawer or panel. The drawer should be called **Practice Setup**, because it applies to the current piece or assignment.

```text
< Back to assignment

Lacrymosa
mm. 18-42
Due Friday

[Score takes most of screen]

Bottom transport:
[Play]  0:38 ━━━━━━━ 2:10

Drawer / panel:
Practice Setup

Applies to:
Lacrymosa

Voice:
[Soprano v]

Practice mode:
[My part] [My part + accomp] [Everyone] [Custom]

Mixer:
Soprano      [sound slider] [visual state]
Alto         [sound slider] [visual state]
Tenor        [sound slider] [visual state]
Bass         [sound slider] [visual state]
Accomp       [sound slider] [visual state]

Annotations:
[+ Add note here]
```

## Practice View Labels

The current technical labels can be translated into singer-facing intent:

- **Everyone**: full score
- **My part**: solo view
- **My part + others**: highlighted view
- **My part + accomp**: common custom preset
- **Custom**: manual track visibility and mixer setup

The mixer lightbulbs remain useful, but they should feel like an advanced customization detail rather than the main mental model.

## Annotation Flow

```text
Add annotation

Position:
Measure 24, beat 2

Note:
[ text field ]

Visibility:
[x] Private to me
[ ] Share with director only
[ ] Share with selected people
[ ] Share with group

[Save]
```

## Track Settings vs App Settings

The app should distinguish settings by where they live:

- **Practice Setup**: applies to this track or assignment.
- **Settings**: applies across the app and account.
- **Group Settings**: applies to a choir and is visible only to group admins.

Avoid calling the player drawer "Settings." Use **Practice Setup** instead.

### Practice Setup

These choices belong to the current track or assignment:

- Voice selected for this piece
- View mode for this piece
- Mixer balance for this piece
- Visible tracks for this piece
- Zoom for this piece
- Measure range for this assignment
- Annotations on this piece

```text
Practice Setup

Applies to this track

Voice
[Soprano v]

View
[My part] [My part + accomp] [Everyone] [Custom]

Mixer
Soprano       volume   visual
Alto          volume   visual
Tenor         volume   visual
Bass          volume   visual
Accomp        volume   visual

Range
Full piece
mm. 18-42

[Save as default for this piece]
```

When a user changes a track-specific setting, the app can offer:

```text
Changed for Lacrymosa
[Make this my default]
```

This lets people tweak naturally, then promote a choice to a global default when it feels right.

### App Settings

These choices apply across all tracks:

- Account profile
- Default voice
- Default view
- Theme
- Count-in
- Background audio
- Annotation privacy default
- Notification preferences
- Keep screen awake while practicing
- Default score zoom

```text
Divisi                              Settings

Settings

Account
Name
Email

Practice defaults
Default voice
[Soprano v]

Default view
[My part + accomp v]

Default theme
[System v]

Playback
Keep screen awake while practicing
Count-in before playback
Background audio

PDF and score
Prefer dark score
Default zoom

Privacy
Annotation sharing default
[Private v]
```

## Admin Experience

Admins need a focused set of group tools. Admin mode should be a view of the group, not a separate destination that feels detached from the group.

```text
SFCC Chamber Choir

Viewing as Admin                    Switch to Member

[Assignments]
[Tracks]
[Members]
[Group settings]

Assignments
[+ New homework]

Tracks
[+ Add track]

Members
[Invite member]
[Manage roles]

Group settings
Name, description, visibility, join code
```

When an admin switches to member view, they should see the same experience a singer sees. This gives admins a preview of how homework and rehearsal tracks appear to the group.

### New Homework

```text
New homework

Piece
[Choose piece v]

Range
[Full piece]
[Measures __ to __]

Due date
[date picker]

Instructions
[text field]

[Assign]
```

## Open UX Questions

- Should a singer choose their default voice during onboarding?
- When an admin opens a group, should the default be member view or admin view?
- Should the member/admin switcher be a text link, badge, or dropdown?
- Should homework support multiple measure ranges?
- Should annotations be shareable with the director by default, or private by default forever unless changed?
- Should admins see completion/progress, or is homework informational only for now?
- Should personal pieces and group pieces live in one library with filters, or separate spaces?
- Should "My part + accomp" be a first-class preset next to "Everyone" and "My part"?
