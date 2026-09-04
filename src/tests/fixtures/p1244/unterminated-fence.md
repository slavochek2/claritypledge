# Must-flag as malformed, without swallowing the tail

```bash
ls foo

The diarize-store is discussed here in prose after an unclosed fence. This tail must be
read as prose, not as code — otherwise one missing fence turns the rest of a file into
false positives. The malformed fence itself is reported so it cannot be a hiding place.
