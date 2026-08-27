# PDF test fixtures

`tagged.pdf` and `untagged.pdf` are Chrome print-to-PDF output of the **same**
HTML source, differing only in Chrome's `tagged` flag. That makes them a
precise probe: any check that reports differently across the pair is genuinely
reading the structure tree rather than guessing from layout.

The source HTML deliberately contains an H1 followed by an H3 (a skipped
heading level), an image with alt text, a decorative image with `alt=""`, a
list, a table with a header row, and two links — one of which uses the phrase
"read more".

To regenerate:

```bash
node -e "
const { chromium } = require('playwright-core');
(async () => {
  const html = '<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Tagged Sample</title></head><body><h1>Quarterly Report</h1><h3>Skipped level heading</h3><p>Some body text for the report.</p><img src=\"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCI+PHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjMDA3Ii8+PC9zdmc+\" alt=\"Blue square chart\"><ul><li>First item</li><li>Second item</li></ul><table><caption>Sales</caption><thead><tr><th>Region</th><th>Total</th></tr></thead><tbody><tr><td>EU</td><td>10</td></tr></tbody></table><p><a href=\"https://example.com\">Read more</a> and <a href=\"https://example.org\">click here</a></p></body></html>';
  const b = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE_PATH });
  const p = await b.newPage();
  await p.setContent(html);
  await p.pdf({ path: 'tests/fixtures/pdf/tagged.pdf', tagged: true });
  await p.pdf({ path: 'tests/fixtures/pdf/untagged.pdf', tagged: false });
  await b.close();
})();
"
```

Regenerating with a different Chrome build may shift byte-level details (and
the `Producer` string), but the structural assertions in `pdf-parse.test.ts`
are written against tag roles, not bytes.
