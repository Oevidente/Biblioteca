import fs from 'fs';

let content = fs.readFileSync('src/pages/Home.tsx', 'utf-8');

// replace: const allGenres = ["All", ...Array.from(canonicalGenres)].slice(0, 16);
// with: const allGenres = ["All", ...Array.from(canonicalGenres).sort((a, b) => getLocalizedTag(a, language).localeCompare(getLocalizedTag(b, language)))].slice(0, 16);

content = content.replace(
  /const allGenres = \["All", \.\.\.Array\.from\(canonicalGenres\)\]\.slice\(0, 16\);/g,
  'const allGenres = ["All", ...Array.from(canonicalGenres).sort((a, b) => getLocalizedTag(a, language).localeCompare(getLocalizedTag(b, language)))].slice(0, 16);'
);

fs.writeFileSync('src/pages/Home.tsx', content);
