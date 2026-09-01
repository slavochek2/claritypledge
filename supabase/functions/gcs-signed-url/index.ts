import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { handleGcsSignedUrl } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GCS_UPLOAD_SECRET = Deno.env.get('GCS_UPLOAD_SECRET') ?? '';
const GCS_CLOUD_FUNCTION_URL = Deno.env.get('GCS_CLOUD_FUNCTION_URL')
  ?? 'https://us-central1-gen-lang-client-0869694595.cloudfunctions.net/gcs-signed-url';

// ── Entry point ──────────────────────────────────────────────────────────────
// P1223 (G6): the JWT check alone let any signed-in user mint an upload URL under ANY
// session's or room's GCS prefix, and a participant could mint one for the OTHER
// participant's object names. The handler now resolves the named prefix with the service
// client, requires the caller to be a participant (clarity_sessions) or the named member
// (transcribe_room_members), and requires the object name to carry the caller's own
// sanitised name before forwarding. See handler.ts / validate.ts.

Deno.serve((req: Request) =>
  handleGcsSignedUrl(req, {
    corsHeaders: buildCorsHeaders(req),
    envReady: !!(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY && GCS_UPLOAD_SECRET),

    getUserId: async (token) => {
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: { user }, error } = await anonClient.auth.getUser(token);
      return error || !user ? null : user.id;
    },

    getSession: async (code) => {
      const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data, error } = await serviceClient
        .from('clarity_sessions')
        .select('creator_profile_id, joiner_profile_id, creator_name, joiner_name')
        .eq('code', code)
        .maybeSingle();
      if (error || !data) return null;
      return {
        creatorProfileId: data.creator_profile_id ?? null,
        joinerProfileId: data.joiner_profile_id ?? null,
        creatorName: data.creator_name ?? null,
        joinerName: data.joiner_name ?? null,
      };
    },

    getProfileName: async (userId) => {
      const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data, error } = await serviceClient
        .from('profiles')
        .select('name')
        .eq('id', userId)
        .maybeSingle();
      if (error || !data) return null;
      return data.name ?? null;
    },

    getRoomMembership: async (memberId) => {
      const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: member, error: memberError } = await serviceClient
        .from('transcribe_room_members')
        .select('profile_id, room_id')
        .eq('id', memberId)
        .maybeSingle();
      if (memberError || !member) return null;
      const { data: room, error: roomError } = await serviceClient
        .from('transcribe_rooms')
        .select('code')
        .eq('id', member.room_id)
        .maybeSingle();
      if (roomError || !room) return null;
      return { profileId: member.profile_id, roomCode: room.code };
    },

    forward: (body) =>
      fetch(GCS_CLOUD_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Upload-Secret': GCS_UPLOAD_SECRET,
        },
        body: JSON.stringify(body),
      }),
  }),
);
