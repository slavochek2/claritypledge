# Database Schema

### profiles

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (matches auth.users.id) |
| email | text | User's email |
| name | text | User's full name |
| role | text | Job title/role (optional) |
| linkedin_url | text | LinkedIn profile (optional) |
| reason | text | Why they signed the pledge |
| avatar_color | text | Profile color theme |
| is_verified | boolean | Email verified status |
| created_at | timestamp | Signup timestamp |

### witnesses

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| profile_id | uuid | Foreign key to profiles |
| witness_name | text | Endorser's name |
| witness_linkedin_url | text | Endorser's LinkedIn (optional) |
| is_verified | boolean | Endorsement verified status |
| created_at | timestamp | Endorsement timestamp |
