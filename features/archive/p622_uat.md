---
status: backlog
feature: p526
type: uat
created_date: 2026-03-16
tags: []
rank: 1000044.0
---

# UAT: P526 — Point Supporting Images

## UAT-1: Add image during point creation
**Given:** User is creating a new point (inline or standalone form)
**When:** User clicks "Add image" button below the statement textarea
**Then:** Native file picker opens, filtered to JPEG/PNG/WebP
**When:** User selects a valid JPEG image under 5MB
**Then:** Thumbnail preview appears below the "Add image" button with a "x" remove overlay
**When:** User submits the point
**Then:** Submit button shows spinner + "Creating...", point is created, image uploads to GCS
**Then:** User lands on point detail page with image visible below statement
**Verify:** Create point with image → detail page shows image. Check DB: `image_url` is set.

## UAT-2: Add image to existing point (author)
**Given:** Author visits their own point detail page (point has no image)
**When:** Author sees "Add image" button below the context/tags area
**Then:** "Add image" button is only visible to the author (not to visitors)
**When:** Author clicks "Add image" and selects a valid file
**Then:** Image uploads, detail page updates to show the image inline
**Verify:** Author adds image to existing point → image appears. Visitor does not see "Add image" button.

## UAT-3: Change image on existing point (author)
**Given:** Author visits their own point detail page (point has an image)
**When:** Author hovers over the image (desktop) or scrolls to it (mobile)
**Then:** "Change" and "Remove" text buttons appear below the image
**When:** Author clicks "Change" and selects a new valid file
**Then:** Upload happens, old image replaced by new one
**Verify:** Change image → new image visible. Old image URL no longer in DB.

## UAT-4: Remove image from existing point (author)
**Given:** Author visits their own point detail page (point has an image)
**When:** Author clicks "Remove" below the image
**Then:** Image disappears immediately (no confirmation dialog)
**Then:** "Add image" button reappears
**Then:** DB: `image_url` is NULL
**Verify:** Remove image → image gone, "Add image" button visible. Refresh → still no image.

## UAT-5: View image on point detail page (visitor)
**Given:** Visitor navigates to a point that has an image
**Then:** Image displays inline, below the statement text, inside the card
**Then:** Image uses `object-contain` (no cropping), constrained by `max-h-64` (desktop) or `max-h-48` (mobile)
**Then:** No "Add image", "Change", or "Remove" controls are visible
**Verify:** Visit point as non-author → image visible, no edit controls.

## UAT-6: Lightbox — click image to expand
**Given:** Point detail page with an image
**When:** User clicks/taps the image
**Then:** Dialog overlay opens with dark backdrop
**Then:** Image displayed at natural resolution, centered, max-w-full max-h-[90vh]
**Then:** Close button visible top-right
**Verify:** Click image → lightbox opens. Image is full-resolution.

## UAT-7: Lightbox — close methods
**Given:** Lightbox dialog is open
**When:** User presses Escape key
**Then:** Lightbox closes
**When:** User clicks the dark backdrop
**Then:** Lightbox closes
**When:** User clicks the "x" close button
**Then:** Lightbox closes
**Verify:** Test all three close methods — each should close the lightbox.

## UAT-8: Image format validation
**Given:** Author tries to upload a file to a point
**When:** Author selects a .gif file
**Then:** Toast error: "Please use a JPEG, PNG, or WebP image under 5MB." — file is not uploaded
**When:** Author selects a .heic file
**Then:** Toast error: "HEIC format isn't supported. Please use JPEG, PNG, or WebP." — specific HEIC message
**Verify:** Try uploading GIF → error toast. Try uploading HEIC → HEIC-specific error toast.

## UAT-9: Image size validation
**Given:** Author tries to upload a file over 5MB
**When:** Author selects a 10MB JPEG
**Then:** Toast error: "Please use a JPEG, PNG, or WebP image under 5MB."
**Verify:** Select a file > 5MB → error toast, no upload.

## UAT-10: Client-side resize
**Given:** Author selects a valid JPEG that is 3000x2000 pixels
**When:** Image is processed before upload
**Then:** Image is resized to max 1200px on longest edge (becomes 1200x800)
**Then:** File size is reduced
**Verify:** Upload a large image → check GCS file dimensions (or check browser-image-compression was called with maxWidthOrHeight: 1200).

## UAT-11: Upload failure graceful degradation
**Given:** Author is creating a point with an image
**When:** Network drops during image upload (or GCS returns 500)
**Then:** Toast error: "Image upload failed. Your point was saved without the image."
**Then:** Point exists in DB (text-only), user can add image later
**Verify:** Simulate network failure during upload → point saved without image, error toast shown.

## UAT-12: Point without image looks normal
**Given:** Point has no image
**When:** Visitor views the point detail page
**Then:** Card looks exactly as it does today — no empty placeholder, no "add image" prompt for non-authors
**Verify:** View text-only point → no visual difference from current behavior.

## UAT-13: Image aspect ratios render correctly
**Given:** Points with images of various aspect ratios
**When:** Viewing detail pages
**Then:** Portrait (1:5) — constrained by max-h, centered horizontally
**Then:** Landscape (5:1) — constrained by card width, height auto
**Then:** Square (1:1) — renders naturally within constraints
**Then:** Tiny image (<100px) — displayed at natural size, no upscaling, centered
**Verify:** Test with portrait, landscape, square, and tiny images — no stretching, no cropping.

## UAT-14: Mobile upload experience
**Given:** Author opens point creation or detail page on mobile
**When:** Author taps "Add image"
**Then:** Camera roll / file picker opens (native mobile behavior)
**When:** Author selects a photo from camera roll
**Then:** Image is resized client-side and uploaded
**Verify:** Test on mobile Safari and Chrome — camera roll works, upload completes.

## UAT-15: No thumbnail in list view
**Given:** Point has an image
**When:** Point appears in feed or profile list view
**Then:** No thumbnail or image preview shown — card looks the same as text-only points
**Verify:** View feed with mix of image/text points — list cards are identical visually.
