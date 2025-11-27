# Polymet Clarity Pledge App

A web application for the Clarity Pledge movement - helping professionals commit to clear communication and reducing the hidden costs of miscommunication.

## Overview

The Clarity Pledge is a public commitment platform where professionals can:
- Sign a pledge to prioritize clear communication
- Build a verified profile with their commitment
- Receive endorsements from colleagues
- Share their certificate publicly
- Join a community of clarity advocates

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite
- **Styling:** Tailwind CSS + Radix UI components
- **Backend:** Supabase (PostgreSQL + Auth)
- **Routing:** React Router
- **Forms:** React Hook Form + Zod validation
- **Icons:** Lucide React
- **Animations:** Framer Motion

## Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account (for backend)

## Setup Instructions

### 1. Clone and Install

```bash
cd 22minds/apps/polymet-clarity-pledge-app
npm install
```

### 2. Configure Supabase

**Get your Supabase credentials:**

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to your project settings → API
3. Copy the **Project URL** and **anon public key**

**Update the Supabase client:**

Edit `src/lib/supabase.ts`:

```typescript
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseAnonKey = 'YOUR_ANON_KEY'; // Should start with "eyJ..."
```

⚠️ **Important:** The anon key must be a JWT token (~200 chars), not a `sb_publishable_...` format.

### 3. Setup Database

**Run the main migration:**

1. Go to Supabase SQL Editor: [SQL Editor](https://supabase.com/dashboard/project/YOUR_PROJECT/sql)
2. Copy the entire contents of `supabase/migration_with_trigger.sql`
3. Paste and execute

This creates:
- `profiles` table for user data
- `witnesses` table for endorsements
- Database trigger for auto-profile creation
- Row Level Security (RLS) policies

**Verify setup:**

Run `supabase/diagnose.sql` to confirm:
- Tables created
- Trigger installed
- Policies active

### 4. Run Development Server

```bash
npm run dev
```

App will be available at `http://localhost:5173`

## Project Structure

```
polymet-clarity-pledge-app/
├── src/
│   ├── lib/
│   │   └── supabase.ts          # Supabase client configuration
│   ├── hooks/
│   │   ├── use-toast.ts         # Toast notifications hook
│   │   └── use-mobile.tsx       # Mobile detection hook
│   ├── components/
│   │   └── ui/                  # Reusable UI components (Radix)
│   └── polymet/                 # Main application code
│       ├── components/          # App-specific components
│       │   ├── clarity-hero.tsx
│       │   ├── sign-pledge-form.tsx
│       │   ├── profile-*.tsx
│       │   └── ...
│       ├── pages/               # Route pages
│       │   ├── clarity-pledge-landing.tsx
│       │   ├── profile-page.tsx
│       │   ├── signatories-page.tsx
│       │   ├── verify-email-page.tsx
│       │   ├── debug-page.tsx   # Debug tools
│       │   └── test-db-page.tsx # DB testing
│       ├── data/
│       │   └── api.ts           # Supabase API functions
│       └── layouts/
│           └── clarity-landing-layout.tsx
├── supabase/                    # SQL migrations and utilities
│   ├── migration_with_trigger.sql   # Main setup
│   ├── diagnose.sql             # Diagnostics
│   └── ...
├── public/
│   └── polymet-logo.svg
├── TROUBLESHOOTING.md           # Detailed troubleshooting guide
└── README.md                    # This file
```

## Key Features

### 1. Pledge Signing
- Users fill out a form with their name, email, role, and reason
- Magic link authentication via email (no passwords)
- Profile auto-created via database trigger

### 2. Email Verification
- Magic link sent to user's email
- Clicking link verifies email and activates profile
- Seamless redirect flow: `/auth/callback` → `/verify/:id` → `/p/:id`

### 3. Public Profiles
- Each user gets a unique profile page: `/p/:id`
- Displays pledge certificate
- Shows endorsements from colleagues
- Shareable via social media

### 4. Endorsement System
- Users can request endorsements from colleagues
- Endorsers verify via email link
- Verified endorsements displayed on profile

### 5. Signatories Directory
- Browse all verified pledge signatories
- Filter and search functionality
- View public profiles

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint
```

## Environment Variables

No `.env` file required! All configuration is in `src/lib/supabase.ts`.

For production deployment, you may want to use environment variables:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Then update `src/lib/supabase.ts` to use them:

```typescript
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
```

## Technical Documentation

For more detailed technical information, please see the following documents:

- [Database Schema](./_docs/technical/database.md)
- [Authentication Flow](./_docs/technical/authentication.md)
- [Deployment Guide](./_docs/technical/deployment.md)
- [Testing Checklist](./_docs/technical/testing.md)
- [Debugging Guide](./_docs/technical/debugging.md)

## Common Issues

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for detailed solutions.

**Quick fixes:**

1. **Profile not found:** Check trigger installation + API key
2. **Magic link fails:** Verify redirect URL + email settings
3. **API errors:** Confirm anon key format (JWT starting with "eyJ")

## Deployment

### Build

```bash
npm run build
```

Output goes to `dist/` folder.

### Deploy Options

- **Vercel:** Connect GitHub repo, auto-deploy
- **Netlify:** Drag & drop `dist/` folder
- **Supabase Hosting:** Use Supabase CLI
- **Custom server:** Serve `dist/` with any static host

**Important for deployment:**
- Set up environment variables
- Configure Supabase redirect URLs
- Update CORS settings if needed

## Testing Checklist

Before deploying, test these flows:

- [ ] Sign pledge with new email
- [ ] Receive and click magic link
- [ ] Profile created and displayed
- [ ] Request endorsement
- [ ] Endorser receives and verifies via email
- [ ] Endorsement shows on profile
- [ ] Share profile link works
- [ ] Signatories page loads all profiles
- [ ] Debug page shows correct status

## Contributing

This is a private project for the Clarity Pledge movement. If you'd like to contribute:

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit for review

## License

Private - All rights reserved

## Support

For issues or questions:
- Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- Use the `/debug` page for diagnostics
- Review Supabase logs for backend errors

---

**Built with clarity in mind. 🎯**
