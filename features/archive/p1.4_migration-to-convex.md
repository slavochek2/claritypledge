---
title: "P7: Tech Foundation - Migrate to Convex"
epic: "Developer Velocity & Next-Generation Features"
status: "Proposed"
author: "Architect"
date: "2025-12-05"
---

### 1. The Challenge: Growing Pains and Future Ambitions

The Clarity Pledge platform has successfully moved beyond its initial MVP. We've proven the core concept and have built a robust, albeit complex, foundation on Supabase. Our engineering team has demonstrated exceptional skill in navigating the challenges of our current stack, particularly in creating the `Reader-Writer` auth pattern to solve critical race conditions and implementing client-side logic for slug generation to avoid Edge Function complexity.

However, as we look toward our next phase of growth—defined by highly interactive, AI-powered features like ["Golden Verification"](./p8_golden-verification.md) (p8) and ["Pledge Success Coaching"](./p10_pledge-success-coaching.md) (p10)—the very workarounds that made us successful are becoming a tax on our development speed. We are spending more time managing client-side state, orchestrating API calls, and reasoning about data consistency than we are on building user value.

This proposal outlines a strategic migration from our current Supabase stack to Convex. This is not a change driven by a desire for new technology, but by a need for an architecture that is fundamentally aligned with the real-time, stateful, and AI-driven application we are becoming.

### 2. The Goal: What Are We Trying to Achieve? (Jobs-to-be-Done)

1.  **When** a developer starts building a new feature, **they want to** work within a fully type-safe, reactive system that handles data synchronization automatically, **so that** they can deliver robust features faster and with less boilerplate code.
2.  **When** a user signs up or interacts with an AI coach, **the platform needs to** execute complex, multi-step operations as single, atomic transactions, **so that** data integrity is guaranteed and the possibility of race conditions is eliminated at the architectural level.
3.  **When** we design our next generation of AI features, **we need to** orchestrate multiple third-party API calls (e.g., Speech-to-Text, LLMs) in a reliable and performant way, **so that** we can build rich, stateful user experiences without compromising the stability of our core application.

### 3. The "Why": A Side-by-Side Explanation

The decision to migrate is best understood by comparing our current challenges with the proposed solutions.

| Current Challenge (Supabase)                                                                                             | The Convex Solution                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Complex Auth Logic:** Our brilliant `Reader-Writer` pattern (`useAuth.ts`, `AuthCallbackPage.tsx`) is a necessary workaround for potential auth race conditions. It's complex application-level code solving a platform-level problem. | **Atomic Mutations:** The entire signup and profile creation flow becomes a single, transactional `mutation` function. This function either fully succeeds or fails, making inconsistent states impossible. The `Reader-Writer` pattern is no longer needed. |
| **Client-Side Slug Generation:** To avoid Supabase Edge Function complexity, our slug conflict resolution logic runs in the browser. This carries a small but real risk of failure if the user navigates away mid-process.          | **Integrated Backend Logic:** This logic moves into the profile creation `mutation` on the backend. It's just a few lines of TypeScript, co-located with our other backend code, with no added deployment complexity.      |
| **Manual Real-time State:** For features like ["Golden Verification"](./p8_golden-verification.md), we would need to manually build a client-side state machine and use Supabase subscriptions to reflect the status of the AI interaction (e.g., "listening," "processing").  | **Default Reactivity:** The UI components would simply `useQuery` to subscribe to the state. As a backend `action` updates the verification status in the database, the UI updates automatically. State management becomes trivial. |
| **API Orchestration for AI:** Building `p8` and `p9` requires calling multiple external APIs. This would require us to build complex logic inside a Supabase Edge Function, managing timeouts and state.                            | **Native Actions:** Convex `actions` are designed for this exact use case. They can run longer, orchestrate multiple API calls, and then call a `mutation` to atomically update the database, all within a clean, type-safe model. |
| **SQL & Migrations:** Every schema change requires writing SQL, managing migration files, and reasoning about RLS policies. It separates the data shape from the application code that uses it.                                        | **Schema in TypeScript:** The database schema is defined in a `.ts` file, living with our code. This provides end-to-end type safety automatically, from the database definition to the React component props.              |

### 4. The Story of the Future

Imagine building the "Golden Verification" feature on Convex.

A developer creates a new file, `convex/verification.ts`. Inside, they define an `action` called `verifyUserUnderstanding`. This function takes the user's recorded audio. It calls a Speech-to-Text API, sends the result to an LLM for analysis, gets the response, and calls a Text-to-Speech API to generate the audio feedback. Finally, it calls a `mutation` that atomically updates the `profiles` table with `golden_verified: true`.

On the frontend, the React component uses `useAction` to trigger the verification and `useQuery` to listen to the user's profile document. As the `action` runs, it updates a `verification_status` field. The UI effortlessly cycles through "Listening...", "Analyzing...", and "Success!" states without a single `useState` or `useEffect` for managing that flow.

The entire feature is built in a fraction of the time, with greater reliability and end-to-end type safety. The developer never leaves their TypeScript environment, never writes a line of SQL, and never builds a complex client-side state machine. **They focus purely on the user experience.**

That is the future this migration unlocks. It's a move from fighting our tools to having them accelerate our most ambitious goals.

### 5. Success Criteria & Phased Approach

To align with our immediate goal of demonstrating Convex's capabilities for the hackathon while ensuring a smooth, complete migration, we will adopt a two-phase approach.

**Phase 1: Hackathon MVP - Minimum Viable Integration**

The primary goal of this phase is to integrate Convex in a meaningful, demonstrable way. Success is defined as completing the following, even if the rest of the application remains on Supabase temporarily.

*   **Success Criteria:**
    1.  **Convex Backend Initialized:** A new Convex project is successfully set up and connected to our repository.
    2.  **Core Schema Ported:** The `profiles` table schema is defined in `convex/schema.ts`.
    3.  **Critical Write Path Migrated:** The entire user signup and profile creation logic—currently handled in `AuthCallbackPage.tsx` and `api.ts`—is successfully refactored into a single, atomic Convex `mutation`. This is the most critical demonstration of Convex's value.
    4.  **Core Read Path Migrated:** The public profile page (`/p/:slug`) is refactored to fetch data using a reactive Convex `query`.
    5.  **Demonstrable Feature:** A user can successfully sign up, have their profile created in Convex, and view their profile page, with all data flowing through the Convex backend.

*   **Hackathon Win Condition:** Completing these steps is a success. We can definitively claim "we use Convex" by showcasing a complete, end-to-end user flow powered by it, highlighting the benefits of atomic mutations and reactive queries.

**Phase 2: Full Application Migration**

This phase completes the transition, fully replacing Supabase and realizing the complete architectural benefits of Convex.

*   **Success Criteria:**
    1.  **All Schemas Migrated:** All remaining data models (e.g., `witnesses`) are ported to the Convex schema.
    2.  **Full Data Migration:** A script is created and executed to migrate all existing data from Supabase to Convex.
    3.  **Complete API Layer Refactor:** All functions in `src/app/data/api.ts` are replaced with corresponding Convex queries and mutations.
    4.  **Authentication Switch:** Supabase Auth is fully replaced with Convex Auth.
    5.  **Supabase Decommissioned:** All dependencies on the Supabase client, libraries, and environment variables are removed from the codebase.
    6.  **All E2E Tests Passing:** The existing Playwright test suite is updated and passes against the fully migrated Convex backend.

This phased approach allows us to secure a "win" for the hackathon by focusing on a high-impact vertical slice of the application, while providing a clear and comprehensive roadmap for the full migration afterward.
