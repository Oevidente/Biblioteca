import fs from 'fs';

let content = fs.readFileSync('src/lib/tagger.ts', 'utf-8');

// replace romansa: { pt: "Romance", ... } with something else, or just handle romansa inside getCanonicalTag
content = content.replace(/romance: \{ pt: "Romance", en: "Romance", es: "Romance", id: "Romantis" \},/g, 'romance: { pt: "Romance", en: "Romance", es: "Romance", id: "Romansa" },');
content = content.replace(/romansa: \{ pt: "Romance", en: "Romance", es: "Romance", id: "Romansa" \}.*\n/g, '');

fs.writeFileSync('src/lib/tagger.ts', content);
