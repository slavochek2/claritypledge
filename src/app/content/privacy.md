## Overview

The Clarity Pledge is operated by TechSalesBox OÜ (registry code 14832496), an Estonian
company ("we," "us," or "our"). This policy explains what personal data we collect, why,
who processes it on our behalf, where it is stored, how long we keep it, and the rights you
have over it. It applies to claritypledge.com and its subdomains, including the blog.

Our Terms of Service describe the service itself; this policy describes the data. Where the
two overlap, this policy is the authoritative description of data handling.

## Data Controller

TechSalesBox OÜ is the data controller for personal data processed through The Clarity
Pledge.

- **Legal entity:** TechSalesBox OÜ
- **Registry code:** 14832496
- **Address:** Harju maakond, Kuusalu vald, Pudisoo küla, Männimäe/1, 74626, Estonia
- **Data protection contact:** privacy AT claritypledge DOT com

We are not required to appoint a Data Protection Officer under GDPR Article 37. The address
above reaches the person responsible for data protection and is monitored.

## What We Collect, and Why

We collect data only when you use a feature that needs it. Each feature below names the data
it uses.

### Account and profile

When you create an account (by magic link or by signing in with Google):

- **Email address** — for sign-in and service email. Never shown publicly.
- **Name** — shown on your public profile and on anything you publish.
- **Sign-in method** and, for Google sign-in, the name and profile picture Google provides.
- **Professional role, LinkedIn URL, reason for signing, bio, avatar** (all optional) — shown
  on your profile.
- **Terms acceptance record** — the version you accepted, when, your browser's user-agent
  string, and a consent identifier: a keyed one-way hash of your IP address when the record
  is written by our servers (signing the pledge, opening a letter), otherwise a random
  identifier generated in your browser. The raw IP address is never stored. We keep this as
  evidence that you accepted these terms.

Your email address is required to hold an account; without it we cannot sign you in or
provide the service. Everything else in your profile is optional.

If you do not upload an avatar, your profile picture may be looked up on Gravatar using a
hash of your email address. That lookup is made by the browser of whoever views your
profile, so Gravatar (Automattic, US) receives the viewer's IP address and the hash — never
the email itself.

### The pledge and endorsements

When you sign the pledge, your name, role, reason and LinkedIn URL become part of your public
pledge page, and your profile may appear in the public pledgers directory. When someone
endorses you as a witness, their name (and optional LinkedIn URL) appears on your profile.

### Stories, points and positions

Stories you write, the points they support, your positions on points, hashtags, and any
images you attach are stored with your account and shown according to the visibility you
choose: private (only you), shared (people who RSVPed to the same event), or public
(anyone). Images attached to stories are
stored in Google Cloud Storage at addresses that are publicly reachable by anyone who has the
link, whatever the story's visibility setting.

### Live sessions (`/live`)

A live session is a real-time understanding exercise between participants. We store the
session code, participant display names, timestamps, the ideas shared, paraphrases, ratings
and feedback.

**Voice recording.** The person who creates a session chooses whether it is recorded, using
the "Record for AI Insights" switch on the start screen; recording is on unless they switch
it off or start a private session. Everyone who joins is told on the join screen that they
are accepting these terms, must grant microphone access in their browser, and sees a
"Session recorded for AI Insights" banner for the whole session. If the session is recorded,
your audio is captured in your browser and uploaded in chunks to our Google Cloud Storage
bucket. After the session, our own transcription service — software we run on Google Cloud —
converts the audio to text and separates the speakers. The transcript is stored with the
session. When the host has switched recording off, the join screen shows a "Private
session" badge; when recording is on, the join screen does not say so before you join.
[FOUNDER DECISION: this describes the shipped flow. The previous policy promised a
separate recording-consent dialog with a "Start Recording" button that does not exist
(`clarity-live-page.tsx:442, 4279`). A joiner today cannot decline recording other than by
not joining, which the adversarial review rates as no valid consent (BLOCK). Recommended:
a per-participant "This session is recorded — I agree" control on the join screen, written
to `session_consents` only after it is tapped, before microphone access]

**Voice profile.** To attribute speech to the right participant across sessions, the
transcription service computes a numerical voice signature (a speaker embedding) for each
participant with an account and stores it against your user ID. This signature is biometric
data in the sense of GDPR Article 9. It is used solely to label who said what in your own
sessions. You can have your voice profile deleted at any time by contacting
privacy AT claritypledge DOT com; deletion does not affect earlier transcripts.
[FOUNDER DECISION: Article 9 data needs explicit, specific consent, and no screen asks for it
today. Either add that consent to the recording step above, or stop writing
`user_voice_profiles` (`services/transcribe/storage.py:66`) and delete this paragraph]

**Behavioural events.** During a recorded session we also capture the timestamps of in-session
actions (positions taken, ratings given) aligned to the audio, so that the two can be studied
together. This upload is stored with your user ID, email and the display names of the
participants so that it can be linked to your account and deleted on request. We have not
yet trained a model on this data; before we do, we will remove names, emails and user IDs.
A voice recording can still identify a person, so this data is pseudonymised rather than
anonymous, and we treat it as personal data throughout.

### Transcribe rooms (`/transcribe`)

A transcribe room is a shared, live transcript that several signed-in people build from their
own devices. Joining requires you to tap a control that reads "Recorded and visible to
everyone in this room"; nothing is captured before you do. Your audio is uploaded to our
Google Cloud Storage bucket, live text is attributed to you with a timestamp and shown to
everyone in the room, and a corrected transcript is produced afterward and added to the
session history of everyone who took part. Leaving the room stops your recording.

### Letters and explain-backs

When you send a Clarity Letter, we store the letter content with your account and the
recipient's email address so we can deliver it; the notification email tells the recipient
who shared their address and how to have it removed. If the recipient has no account, one
is created for them when they open the letter, holding only their email address until they
choose to add more, and they are shown the Terms and this policy at that moment. Opening
and confirming a letter records a keyed one-way hash of the reader's IP address as evidence
of who responded.

When a recipient records an **explain-back** (their spoken understanding of a story), the
recording is made when they press record, stored in a private Google Cloud Storage bucket
that only the two letter participants can access through the platform, and is not used for
any other purpose. A text alternative is available for anyone who prefers not to record.

### Clarity Partner Agreements

When you create an agreement, we store your partner's email address to send the invitation,
identifying you as the sender. If the invitation is not accepted it expires after seven
days; the email address is deleted on request. [FOUNDER DECISION: the previous text said it
is deleted automatically at expiry — nothing does that (`agreements-service-real.ts:255-264`
only flips the status). Add a cleanup job and restore the automatic wording, or keep this]

### Events and groups

If you RSVP to an event we record that against your profile and show your attendance to the
host and other attendees. We send event emails (confirmations, reminders, follow-ups) to your
account email. Hosts may attach private information to an event (for example a WhatsApp group
link) that is shown only to registered attendees; anything you share inside such a group is
processed by WhatsApp under its own terms, not by us. Group membership and the organizer role
are stored and visible to other members of that group.

### AI features

- **`/chat` story guide.** The text you type is sent to Google's Gemini API to generate a
  reply and is streamed back to you. We do not store your chat messages on our servers; we
  record only that your account made a request, for rate limiting.
- **Event and story banners.** When you ask for a generated banner, the event or story title
  and description are sent to Google's Gemini API to produce an image, and title keywords may
  be sent to Unsplash to find a stock photo.

Google processes this content under its own terms. Do not enter health, religious or other
special-category information into these features, and avoid putting people's names in
event or story titles that you ask us to illustrate; the platform works without these
features. [FOUNDER DECISION: the calls go to the Gemini Developer API
(`generativelanguage.googleapis.com`), not Vertex AI. On the unpaid tier Google may use
prompts to improve its products and no Cloud DPA applies — confirm the project is on the
paid tier, or move Google Gemini to the independent-controller list below]

### Donations and paid offers

Payments go through Stripe payment links. Your card details are entered on Stripe's pages and
never reach us. Stripe shows us the amount, your name and the email you entered so we can
acknowledge your payment.

### Forms, bookings and the blog

- **Contact and application forms** on our site are delivered by Web3Forms, which receives
  exactly what you submit.
- **Event feedback forms** linked from our emails are hosted by Tally, which receives what you
  submit together with the event identifier.
- **Intro call booking** is an embedded Google Calendar appointment page; what you enter there
  is processed by Google.
- **Blog and newsletter.** Our blog runs on Ghost, which we host ourselves on Google Cloud.
  When you subscribe on the blog, Ghost stores your email. We also add verified account
  holders to the newsletter list, on the basis of our legitimate interest in telling the
  people who use the product about it; every issue carries an unsubscribe link, and you can
  opt out at any time without affecting your account. [FOUNDER DECISION: the adversarial
  review rates account-creation-as-consent as HIGH risk under Estonian ESS §103¹ soft opt-in
  (a free account is not a sale). Recommended: an unticked "product updates" checkbox at
  sign-up, and sync only those who tick it. Also confirm whether Ghost's open/click tracking
  is on; if so, disclose it here]

### Videos embedded in stories

Some stories embed a YouTube video. We use YouTube's privacy-enhanced embed
(youtube-nocookie.com): loading the page still contacts Google (your IP address and browser
details), but tracking cookies are set only when you press play. The same applies to Google
profile pictures and the embedded booking calendar. Once you play a video, Google processes
your viewing under its own policy.

### Analytics, session recording and error tracking

- **Mixpanel (EU servers).** We record product events (page views, feature use) and, after you
  sign in, your user ID, email, name and profile flags (for example whether you have pledged),
  so we can understand how the product is used. **Mixpanel also records sessions**: a replay of
  how the page was used — clicks, scrolling and navigation — with the contents of form fields
  excluded from capture. [FOUNDER DECISION: session recording without a prior opt-in is the
  single largest consent gap this review found — either add a consent control before
  `mixpanel.init` runs, or reduce `record_sessions_percent` to 0 and delete this sentence]
- **Sentry.** When an error occurs we send Sentry the stack trace, the URL or action that
  triggered it, browser and device metadata, and in some cases your user ID. Sentry is
  configured not to send personal data by default. On an error only, a masked replay of the
  page is attached: all text is masked and all media is blocked before it leaves your browser.
  Sentry also receives performance timings for about one in ten page loads, including the
  URL visited, and browser security (CSP) violation reports.

You can object to analytics and error tracking by emailing us; we then delete your Mixpanel
profile and any Sentry events carrying your identifiers. There is no in-app switch yet.
[FOUNDER DECISION: Mixpanel ships `opt_out_tracking()` — a Settings toggle would make this
self-serve]

### Technical data

Our hosting providers keep standard server logs (IP address, user agent, requested URL) for
security and operations. We do not build profiles from them.

## Legal Bases

| Purpose | Basis |
|---|---|
| Account, profile, pledge, stories, letters, agreements, events, groups, live sessions, transcribe rooms, donations acknowledgement | Contract — Art. 6(1)(b) |
| Voice recording in live sessions and transcribe rooms; explain-back recordings | Consent — Art. 6(1)(a), given by the host's recording switch, the transcribe-room agreement control, or pressing record [FOUNDER DECISION: see Live sessions above for the joiner gap] |
| Voice profiles (speaker embeddings) | Explicit consent — Art. 9(2)(a) [FOUNDER DECISION: not collected today — see Live sessions] |
| Using recordings, transcripts and session events to improve our AI/ML services (anonymized) | Consent — Art. 6(1)(a), given with the recording |
| Storing a letter recipient's or agreement partner's email address, and sending it to our email provider | Legitimate interest — Art. 6(1)(f): delivering what a user asked us to send to you; you can have it removed at any time |
| Product newsletter to account holders | Legitimate interest — Art. 6(1)(f), with an unsubscribe in every issue [FOUNDER DECISION: see Blog and newsletter] |
| Analytics and session recording (Mixpanel), error tracking (Sentry) | Legitimate interest — Art. 6(1)(f); you can object at any time [FOUNDER DECISION: the review rates session replay tied to your email as not defensible under legitimate interest, and the Mixpanel device identifier as needing consent under ePrivacy Art. 5(3)] |
| Terms acceptance and consent records | Legitimate interest — Art. 6(1)(f), being able to evidence that consent was given (Art. 7(1)) |
| Public-source content by machine accounts (below) | Legitimate interest — Art. 6(1)(f): commentary on public statements by public figures [FOUNDER DECISION: whether the Estonian journalistic exemption (IKS §4) applies is for counsel] |

## Machine Accounts and Public-Source Content

Some accounts on the platform are operated by machines rather than by the person they are
named after. Such an account reads a public video of a public figure and publishes its own
reading of what was said, with quotes taken from the video's captions and linked to a
timecode. Every such story is marked as machine-written and names the human operator
responsible for it. The position such an account takes is the account's reading, never the
named person's own stated position.

**What we hold about the person.** Their name, the statements they made in the public
video, and a link to it. **Source:** the video's own captions on YouTube, selected by the
named operator. **Retention:** while the story is published. Quotes are caption text; they
carry a timecode so anyone can check them against the video, but we do not certify that
every quote has been checked against the audio. The named operator confirms every filing
before it is published and takes editorial responsibility for it.

If you are a person named or quoted by a machine account, you can object to the processing
(Art. 21) and ask for a correction or removal by writing to
privacy AT claritypledge DOT com. [FOUNDER DECISION: response commitment for correction
requests — P1142 requires "a route that is actually monitored"; the review recommends
72 hours to acknowledge and 7 days to resolve. State a window only if it will be kept]

## Who Processes Your Data

| Provider | What for | Data | Where |
|---|---|---|---|
| Supabase | Database, authentication, real-time sync, server functions | All account and content data | United States (AWS us-east-1) |
| Brevo | Delivers sign-in emails | Email address, sign-in link | European Union |
| Google (Sign-In) | Optional sign-in | Google account email, name, picture | Google's global infrastructure |
| Google Cloud (Storage, Cloud Run, Cloud Functions) | Audio, images, transcription service we run | Recordings, transcripts, voice profiles, images | United States |
| Google Gemini API | `/chat` replies; generated banners | Chat text; event/story titles and descriptions | Google's global infrastructure |
| Mailgun | Letters, agreement, event, newsletter and sign-in emails | Email address, sender name, links | European Union |
| Ghost (self-hosted) | Blog and newsletter | Subscriber name and email | United States (Google Cloud) |
| Mixpanel | Analytics and session recording | User ID, email, name, events, session replays | European Union |
| Sentry | Error tracking, masked error replays, CSP reports | Error data, user ID, browser metadata | [FOUNDER DECISION: confirm the Sentry organisation's data region — EU or US] |
| Vercel | Website hosting and share-card images | Server logs | Global edge network |
| Stripe | Donations and paid offers | Payment details (entered on Stripe) | Stripe's infrastructure |
| Web3Forms | Contact and application forms | What you submit | Provider's infrastructure |
| Tally | Event feedback forms | What you submit | European Union |
| Unsplash | Stock photo search for banners | Title keywords only | United States |
| YouTube (privacy-enhanced embed) | Story videos | Viewing data once you press play | Google's global infrastructure |
| Google Calendar | Intro call booking | What you enter on the booking page | Google's global infrastructure |
| Gravatar | Avatar lookup | Hash of your email, viewer's IP | United States |
| Hugging Face | Source of the speaker-separation model our transcription service downloads | No user data | United States |

We do not sell personal data. Providers that process data on our behalf do so under their
data processing terms; Stripe, Google (for Sign-In, YouTube and Calendar), WhatsApp and
Unsplash act as independent controllers for what you give them directly. [FOUNDER DECISION:
keep a private register of which providers have an accepted DPA (Web3Forms, Tally, Brevo and
the Gemini API tier are unverified) and list only those here as processors]

**Who else sees your data.** Other participants in a session or room (display name, voice,
live text); the sender and recipient of a letter (letter content, explain-back); attendees of
an event you RSVP to (that you are attending); members of a group you join; and, for
anything you publish, the public.

## International Transfers

TechSalesBox OÜ is based in Estonia, but **our primary database and file storage are in the
United States** (Supabase on AWS us-east-1; Google Cloud). Analytics (Mixpanel) and email
(Mailgun, Brevo) run in the European Union.

Transfers outside the European Economic Area rely on the European Commission's Standard
Contractual Clauses and, where the provider is certified, the EU-U.S. Data Privacy Framework.
Our own transcription service runs in Google Cloud's US region, so session audio is
transferred there under Google Cloud's data processing terms and transfer safeguards.
[FOUNDER DECISION: verify current DPF certification for Supabase, Google, Vercel, Sentry,
Stripe and Unsplash before publishing; remove the DPF clause for any that are not listed]

## Cookies and Local Storage

We do not use advertising cookies or cross-site tracking. We use:

- **Sign-in session** — Supabase stores your session token in your browser's local storage so
  you stay signed in.
- **Our own local storage keys** — the active live session and your display name, an
  in-progress letter reply draft, preview predictions for docs, and flags such as "first time
  pledge", all so that a refresh does not lose your place.
- **Mixpanel** — a device identifier and session state, to connect events and session
  recordings from the same browser.
- **Sentry** — a session identifier while an error replay is being captured.
- **YouTube (privacy-enhanced)** — cookies only after you press play on an embedded video.

[FOUNDER DECISION: no cookie/consent banner exists today; the Mixpanel identifiers above are
non-essential under the ePrivacy rules and need either a consent control or removal]

## Your Rights

Under the GDPR you can:

- **Access** (Art. 15) — ask for a copy of the personal data we hold about you.
- **Rectification** (Art. 16) — edit your profile at any time; ask us to correct anything else.
- **Erasure** (Art. 17) — delete your account yourself from the Settings page. Deletion is
  immediate and removes your profile, stories, positions, endorsements, RSVPs, sign-in
  identity and rate-limit records. Points and events you created that other people have
  built on remain, with your name removed. Active partner agreements are ended. Recordings,
  transcripts, voice profiles, letters and explain-backs, and your analytics and error-tracking
  profiles are deleted on request by email. [PENDING P520: the self-serve control ships
  with P520; until then, request deletion by email and we complete it within 30 days.
  FOUNDER DECISION: P520's deletion table does not cover `session_transcripts`,
  `user_voice_profiles`, GCS audio, letters or provider-side profiles — either extend P520 or
  keep the "on request" split above]
- **Portability** (Art. 20) — ask for an export of your data in a machine-readable format
  (JSON). There is no self-serve export yet; email us.
- **Objection** (Art. 21) — object to analytics, session recording, error tracking or the
  newsletter without deleting your account.
- **Restriction** (Art. 18) — ask us to pause processing while a dispute is resolved.
- **Withdraw consent** (Art. 7(3)) — for recordings, voice profiles and AI/ML use, at any
  time. When you withdraw, we delete the recordings, transcripts and voice profile concerned
  so that they are not used further; withdrawal does not undo processing that already
  happened.

Limits: once identifiers have been removed from training data and a model has been trained,
the model cannot be untrained; we keep records needed to evidence consent and payments for
as long as claims could be made (see Data Retention).

To exercise any right, email privacy AT claritypledge DOT com. We respond within 30 days.

## Data Retention

- **Account and profile data** — kept while your account exists; deleted when you delete it
  (see Your Rights).
- **Content you publish** (stories, points, positions, letters) — kept while your account
  exists, subject to the survival rules above for community data.
- **Audio recordings, transcripts and voice profiles** — kept while your account exists,
  unless you ask us to delete them earlier. We do not currently delete recordings on a fixed
  schedule. [FOUNDER DECISION: set a retention period and implement it as a storage lifecycle
  rule before promising one; the previous "90 days" statement was never implemented]
- **Explain-back recordings** — kept while the letter exists.
- **Partner and recipient email addresses** for unaccepted invitations — deleted when the
  invitation expires (7 days) or on request.
- **Consent and terms-acceptance records** — kept after account deletion for as long as a
  claim could be made about that consent. [FOUNDER DECISION: state the period — the Estonian
  general limitation period is three years — and confirm P520 does not delete these rows
  if that is the choice]
- **Rate-limit records for AI features** (user ID and timestamp) — deleted with your account.
- **Error data (Sentry)**, **analytics and session recordings (Mixpanel)** — retained
  according to each provider's default retention. [FOUNDER DECISION: state the configured
  retention for each after checking the project settings]
- **Server logs** — per our hosting providers' standard retention.

## Automated Decision-Making

We do not make automated decisions that produce legal or similarly significant effects on
you (GDPR Article 22). Our AI features generate text, images and transcripts; they do not
decide anything about your account, access or rights.

## Children

The service is intended for adults. You must be 16 or older to create an account; there is
no exception for parental consent. We do not knowingly collect data from anyone younger; if
you believe a child has created an account, contact us and we will delete it.
[FOUNDER DECISION: no age check exists at sign-up — the review recommends an age attestation
checkbox]

## Filing a Complaint

If you believe we have mishandled your data, you can lodge a complaint with the Estonian Data
Protection Inspectorate (Andmekaitse Inspektsioon, [www.aki.ee/en](https://www.aki.ee/en))
or with the supervisory authority in your country of residence (GDPR Article 77). We would
appreciate the chance to resolve your concern first: privacy AT claritypledge DOT com.

## Changes to This Policy

We update this policy when the product changes. Significant changes are announced by service
email or a notice on the website, and where they change the terms you accepted, you will be
asked to accept the new version on your next sign-in.

## Contact

Questions about this policy? privacy AT claritypledge DOT com.
