---
name: redact-image
description: Redact sensitive text from screenshots using macOS Vision OCR substring bounding boxes. Single script, single pass, exact coordinates — no guessing.
when_to_use: Before publishing screenshots that contain email addresses, personal info, or sensitive labels. Run after taking a screenshot, before uploading to Ghost or social media.
version: 3.0.0
---

# Redact Image

Redact sensitive text from a screenshot. Uses `VNRecognizedText.boundingBox(for: Range)` to get exact pixel coordinates for any substring — not line-level, not character-guessing. One script, one pass.

## Usage

```
/slava:content:redact-image                           # Latest screenshot from ~/Screenshots
/slava:content:redact-image /path/to/image.png        # Specific file
/slava:content:redact-image "redact all emails"       # With guidance on what to redact
```

## Process

### Step 1: Read the Image and Identify Targets

Read the source image. Identify ALL sensitive elements:

**Always redact (unless user says otherwise):**
- Email addresses (in headers, signatures, to/from fields)
- Phone numbers
- Physical addresses (street, city — country is OK)
- Gmail labels that reveal personal info (e.g., "MY SPAM", custom labels)
- Account IDs, API keys, tokens

**Keep visible (unless user says otherwise):**
- Names of public figures (their email addresses still get redacted)
- Company names mentioned in context
- Dates and timestamps
- The actual message/conversation content

List all identified items and ask: "Redact these items? Anything to add or skip?"

**OCR quirk:** Vision OCR may read text without spaces (e.g., "MY SPAM" → "MYSPAM"). When building the pattern list, include both variants.

### Step 2: Run the Redaction Script

Write `/tmp/ocr-redact.swift` with the patterns to redact, then run it. This single script does OCR + substring matching + redaction in one pass.

```swift
import Vision
import CoreGraphics
import ImageIO
import Foundation

let args = CommandLine.arguments
guard args.count >= 4 else {
    print("Usage: ocr-redact <source> <destination> <pattern1> [pattern2] ...")
    exit(1)
}

let srcPath = args[1]
let dstPath = args[2]
let patterns = Array(args[3...])

// Load image
let srcURL = URL(fileURLWithPath: srcPath) as CFURL
guard let source = CGImageSourceCreateWithURL(srcURL, nil),
      let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    print("ERROR: Failed to load image"); exit(1)
}

let pw = cgImage.width
let ph = cgImage.height
print("Image: \(pw)x\(ph)")

// OCR
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try! handler.perform([request])

guard let observations = request.results else {
    print("ERROR: No OCR results"); exit(1)
}

// Find bounding boxes using VNRecognizedText.boundingBox(for: Range)
// This gives EXACT pixel coordinates for any substring within a line.
var rects: [(x: Int, y: Int, w: Int, h: Int, pattern: String)] = []

for obs in observations {
    guard let candidate = obs.topCandidates(1).first else { continue }
    let text = candidate.string

    for pattern in patterns {
        guard let range = text.range(of: pattern, options: .caseInsensitive) else { continue }

        do {
            if let boxObs = try candidate.boundingBox(for: range) {
                let box = boxObs.boundingBox
                // Normalized (0-1, bottom-left origin) → pixels (top-left origin)
                let x = Int(box.origin.x * CGFloat(pw)) - 6
                let y = Int((1.0 - box.origin.y - box.height) * CGFloat(ph)) - 6
                let w = Int(box.width * CGFloat(pw)) + 12
                let h = Int(box.height * CGFloat(ph)) + 12
                rects.append((x: max(0, x), y: max(0, y), w: w, h: h, pattern: pattern))
                print("FOUND: \"\(pattern)\" at (\(x), \(y), \(w), \(h))")
            }
        } catch {
            print("WARN: boundingBox failed for \"\(pattern)\": \(error)")
        }
    }
}

if rects.isEmpty {
    print("ERROR: No patterns matched in OCR output"); exit(1)
}

// Draw redaction rectangles
let colorSpace = CGColorSpaceCreateDeviceRGB()
guard let ctx = CGContext(data: nil, width: pw, height: ph, bitsPerComponent: 8,
                          bytesPerRow: pw * 4, space: colorSpace,
                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
    print("ERROR: Failed to create context"); exit(1)
}

ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: pw, height: ph))
ctx.setFillColor(CGColor(red: 0.15, green: 0.15, blue: 0.15, alpha: 1.0))

for r in rects {
    let cgY = ph - r.y - r.h  // top-left → CG bottom-left
    ctx.fill(CGRect(x: r.x, y: cgY, width: r.w, height: r.h))
}

// Save
guard let resultImage = ctx.makeImage() else { print("ERROR: No image"); exit(1) }
let destURL = URL(fileURLWithPath: dstPath) as CFURL
guard let dest = CGImageDestinationCreateWithURL(destURL, "public.png" as CFString, 1, nil) else {
    print("ERROR: No dest"); exit(1)
}
CGImageDestinationAddImage(dest, resultImage, nil)
CGImageDestinationFinalize(dest)
print("Saved to \(dstPath)")
print("Redacted \(rects.count) items")
```

Run:
```bash
swift /tmp/ocr-redact.swift "{source}" "{destination}" "pattern1" "pattern2" ...
```

### Step 3: Verify

Read the output image. Confirm each target is covered. Because `boundingBox(for: Range)` returns exact substring coordinates (not line-level estimates), this should pass on first attempt.

**If a pattern wasn't found (WARN in output):**
- OCR may have read the text differently (e.g., "MY SPAM" → "MYSPAM", "›" instead of ">")
- Add the OCR variant as an additional pattern and re-run

### Step 4: Report

```
Done — image redacted
  Source: {source_path}
  Output: {output_path}
  Redacted: {count} items
  - {list}
  Method: Vision OCR substring bounding boxes (single pass)
```

## Why This Works

**The key API:** `VNRecognizedText.boundingBox(for: Range<String.Index>)` returns a `VNRectangleObservation` with the exact pixel rectangle for any substring within a recognized text line. This is the difference between:

- **v1 (broken):** Guess pixel coordinates → always wrong → iterate forever
- **v2 (partial):** OCR line-level boxes → still guessing within lines
- **v3 (this):** OCR substring-level boxes → exact coordinates → single pass

## Constraints

- **No installs** — Swift, Vision, CoreGraphics ship with macOS
- **macOS 10.15+** — `boundingBox(for:)` available since Catalina
- **Text only** — can't redact non-text elements (photos, icons). For those, crop instead.
- **Format-agnostic** — `CGImageSourceCreateWithURL` handles PNG, JPEG, HEIC
