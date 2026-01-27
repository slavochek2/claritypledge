import { chromium } from 'playwright';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testLiveFlow() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Collect console logs
  page.on('console', msg => {
    if (msg.text().includes('[Live]')) {
      console.log('CONSOLE:', msg.text());
    }
  });

  try {
    // Go to /live
    console.log('1. Navigating to /live...');
    await page.goto('http://localhost:5001/prototype/linkedin-like/live');
    await sleep(1000);

    // Screenshot initial state
    await page.screenshot({ path: 'test-results/live-1-start.png' });
    console.log('   Screenshot: live-1-start.png');

    // Click "Create Meeting"
    console.log('2. Clicking Create Meeting...');
    await page.click('text=Create Meeting');
    await sleep(500);
    await page.screenshot({ path: 'test-results/live-2-waiting.png' });
    console.log('   Screenshot: live-2-waiting.png');

    // Click "Simulate: Partner Joined"
    console.log('3. Clicking Simulate: Partner Joined...');
    await page.click('text=Simulate: Partner Joined');
    await sleep(500);
    await page.screenshot({ path: 'test-results/live-3-live.png' });
    console.log('   Screenshot: live-3-live.png');

    // Type in search - "remote" matches "Remote work is more productive..."
    console.log('4. Searching for content...');
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill('remote');
    await sleep(500);
    await page.screenshot({ path: 'test-results/live-4-search.png' });
    console.log('   Screenshot: live-4-search.png');

    // Look for a Point card and click its button
    console.log('5. Looking for Point with "Does Alice agree?" button...');
    const pointButton = page.locator('button:has-text("Does Alice agree?")').first();
    if (await pointButton.isVisible()) {
      console.log('   Found Point button, clicking...');
      await pointButton.click();
      await sleep(500);
      await page.screenshot({ path: 'test-results/live-5-point-selected.png' });
      console.log('   Screenshot: live-5-point-selected.png');

      // Now we need to select a position first
      console.log('6. Selecting position (Agree)...');
      const agreeButton = page.locator('button:has-text("Agree")').first();
      if (await agreeButton.isVisible()) {
        await agreeButton.click();
        await sleep(500);
        await page.screenshot({ path: 'test-results/live-6-position-selected.png' });
        console.log('   Screenshot: live-6-position-selected.png');

        // Click "Does Alice agree?" again (the submit button)
        console.log('7. Clicking "Does Alice agree?" to submit...');
        const submitButton = page.locator('button:has-text("Does Alice agree?")').first();
        await submitButton.click();
        await sleep(500);
        await page.screenshot({ path: 'test-results/live-7-after-submit.png' });
        console.log('   Screenshot: live-7-after-submit.png');

        // Wait for simulation
        console.log('8. Waiting for simulation (2 seconds)...');
        await sleep(2000);
        await page.screenshot({ path: 'test-results/live-8-after-simulation.png' });
        console.log('   Screenshot: live-8-after-simulation.png');
      } else {
        console.log('   Position buttons not found');
      }
    } else {
      console.log('   Point button not found, trying Story flow...');
      // Try Story flow instead
      const storyButton = page.locator('button:has-text("Does Alice understand")').first();
      if (await storyButton.isVisible()) {
        console.log('   Found Story button');
      }
    }

    console.log('\nTest complete! Check test-results/ for screenshots.');
    await sleep(3000);

  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: 'test-results/live-error.png' });
  } finally {
    await browser.close();
  }
}

testLiveFlow();
