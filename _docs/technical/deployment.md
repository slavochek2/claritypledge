# Deployment

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


