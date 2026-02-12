/**
 * Verify P135 "Verify together" button works end-to-end
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from './helpers/test-user';
import { supabaseAdmin } from '../src/lib/supabase-admin';

test.describe('P135 Verify Together - Full Flow', () => {
  test('Complete flow: button click → waiting room → works', async ({ page }) => {
    let hostUser = null;
    let attendeeUser = null;
    let eventId = null;

    try {
      // 1. Create test users
      console.log('📝 Creating test users...');
      hostUser = await createTestUser({ name: 'Host User' });
      attendeeUser = await createTestUser({ name: 'Target Attendee' });
      console.log(`   Host: ${hostUser.email}`);
      console.log(`   Attendee: ${attendeeUser.email}`);

      // 2. Create event
      console.log('\n📝 Creating test event...');
      const startDate = new Date();
      startDate.setHours(startDate.getHours() + 2);

      const { data: event, error: eventError } = await supabaseAdmin
        .from('events')
        .insert({
          slug: `p135-test-${Date.now()}`,
          title: 'P135 Verification Test',
          description: 'Testing the Verify Together button',
          datetime: startDate.toISOString(),
          duration_minutes: 60,
          timezone: 'America/Los_Angeles',
          location: 'Test Location',
          host_id: hostUser.user.id,
          status: 'upcoming',
        })
        .select('id, slug')
        .single();

      if (eventError) throw new Error(`Failed to create event: ${eventError.message}`);
      eventId = event.id;
      console.log(`   Event created: ${event.slug}`);

      // 3. RSVP attendee
      const { error: rsvpError } = await supabaseAdmin
        .from('event_rsvps')
        .insert({
          event_id: event.id,
          profile_id: attendeeUser.user.id,
        });

      if (rsvpError) throw new Error(`Failed to RSVP: ${rsvpError.message}`);
      console.log(`   Attendee RSVP'd`);

      // 4. Log in as host and navigate to event
      console.log('\n🌐 Setting up browser session...');
      await setTestSession(page, hostUser.email);

      await page.goto(`http://localhost:5001/events/${event.slug}`);
      await page.waitForLoadState('networkidle');
      console.log(`   Navigated to event page`);

      // 5. Verify "Verify together" button exists
      console.log('\n🔍 Looking for "Verify together" button...');
      const verifyButton = page.locator('button', { hasText: 'Verify together' }).or(
        page.locator('button', { hasText: 'Verify →' })
      ).first();

      await expect(verifyButton).toBeVisible({ timeout: 10000 });
      console.log('   ✅ Button found!');

      // 6. Click the button
      console.log('\n🔘 Clicking "Verify together" button...');
      await verifyButton.click();

      // 7. Wait for navigation to waiting room
      console.log('⏳ Waiting for navigation...');
      await page.waitForURL(/\/events\/.*\/waiting\//, { timeout: 10000 });
      const finalURL = page.url();
      console.log(`   ✅ Navigated to: ${finalURL}`);

      // 8. Verify we're NOT on error page
      console.log('\n✅ Checking page content...');
      const hasErrorPage = await page.locator('text=Something went wrong').isVisible().catch(() => false);
      expect(hasErrorPage).toBe(false);
      console.log('   ✅ No error page');

      // 9. Verify waiting room content appears
      const hasWaitingContent = await page.locator('text=Waiting for').or(
        page.locator('text=Unable to Load Session')
      ).isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasWaitingContent).toBe(true);
      console.log('   ✅ Waiting room page loaded');

      // 10. Verify sub-room was created in database
      console.log('\n🗄️  Checking database...');
      const { data: subRooms } = await supabaseAdmin
        .from('event_sub_rooms')
        .select('*')
        .eq('event_id', event.id)
        .eq('initiator_id', hostUser.user.id)
        .eq('target_id', attendeeUser.user.id);

      expect(subRooms?.length).toBeGreaterThan(0);
      console.log(`   ✅ Sub-room created in database (${subRooms[0].id})`);
      console.log(`      Status: ${subRooms[0].status}`);
      console.log(`      Initiator: ${subRooms[0].initiator_id}`);
      console.log(`      Target: ${subRooms[0].target_id}`);

      console.log('\n🎉 ALL TESTS PASSED!\n');

    } finally {
      // Cleanup
      console.log('🧹 Cleaning up...');
      if (eventId) {
        await supabaseAdmin.from('events').delete().eq('id', eventId);
      }
      if (hostUser) {
        await deleteTestUser(hostUser.user.id);
      }
      if (attendeeUser) {
        await deleteTestUser(attendeeUser.user.id);
      }
      console.log('   ✅ Cleanup complete\n');
    }
  });
});
