import fs from 'fs';
import path from 'path';

function cleanupDuplicateGroups() {
  const storePath = path.join(process.cwd(), 'data', 'mipa_shared_store.json');
  if (!fs.existsSync(storePath)) {
    console.log('Store file does not exist');
    return;
  }

  const raw = fs.readFileSync(storePath, 'utf-8');
  const data = JSON.parse(raw);

  if (!Array.isArray(data.groups)) {
    console.log('No groups array');
    return;
  }

  const initialCount = data.groups.length;
  console.log('Initial groups count:', initialCount);

  const seenUrls = new Set<string>();
  const uniqueGroups: any[] = [];

  // Sort groups by total_posts_found DESC, created_at DESC so we keep the one with data
  data.groups.sort((a: any, b: any) => {
    const postsDiff = (b.total_posts_found || 0) - (a.total_posts_found || 0);
    if (postsDiff !== 0) return postsDiff;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  for (const group of data.groups) {
    const normalizedUrl = group.url.trim().toLowerCase().replace(/\/+$/, '');
    if (!seenUrls.has(normalizedUrl)) {
      seenUrls.add(normalizedUrl);
      uniqueGroups.push(group);
    }
  }

  console.log('Unique groups count after deduplication:', uniqueGroups.length);
  data.groups = uniqueGroups;

  fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log('Cleaned and saved store successfully.');
}

cleanupDuplicateGroups();
