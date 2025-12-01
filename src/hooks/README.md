# Hooks

This directory contains custom React hooks used throughout the application.

## `usePledgeForm`

Manages the state and submission logic for the pledge form.

- **State:** Handles form fields for `name`, `email`, `role`, `linkedinUrl`, and `reason`.
- **Submission:** Manages submission state (`isSubmitting`) and errors (`error`).
- **Actions:** Includes a `handleSubmit` function that performs validation, normalizes data, and calls the `createProfile` API.
- **Effects:** Triggers a confetti effect on successful submission.

### Usage

```tsx
import { usePledgeForm } from "@/hooks/use-pledge-form";

const { formState, setters, handleSubmit } = usePledgeForm(onSuccessCallback);
```

## `useUser`

A critical authentication hook that manages the user's session and profile data.

- **State:** Tracks the current `user` profile and a `isLoading` flag.
- **Authentication:** Observes Supabase auth state changes to keep the user session up-to-date.
- **Data Fetching:** Fetches the user's profile from the database when the session is active.
- **Actions:** Provides a `signOut` function to log the user out.

### Usage

```tsx
import { useUser } from "@/hooks/use-user";

const { user, isLoading, signOut } = useUser();
```


