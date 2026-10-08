---
title: Feature check
tags: [markdown, test]
---

# Feature check

Inline `code`, **bold**, _italic_, ~~strike~~, [relative link](vietnamese-utf8.md) and an autolink https://example.com.

## Code

```js
// highlighted
const answer = 42;
function greet(name) { return `hi ${name}`; }
```

```unknownlang
plain text block
```

## Sanitizer

<img src="x" onerror="window.__xss = 1">
<script>window.__xss = 2</script>
<a href="javascript:window.__xss=3">bad link</a>

<details><summary>Raw HTML details</summary>Allowed HTML stays.</details>

## Duplicate
## Duplicate

### Nested heading
